import { URL } from 'url';
import nock from 'nock';
import factory from 'rdf-ext';
import {
  NetworkError,
  SparqlProbeResult,
  DataDumpProbeResult,
} from '@lde/distribution-probe';
import { classify, probeOutcomes } from '../src/distribution-probe/outcomes.js';
import { DistributionProbeStage } from '../src/distribution-probe/probe.js';
import { dcat, rdf } from '../src/query.js';
import { shacl } from '../src/validator.js';
import type {
  DistributionHealthRecord,
  DistributionHealthStore,
} from '../src/distribution-health-store.js';

const ndeProbePrefix = 'https://def.nde.nl/probe#';

function mockResponse(
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(null, {
    status: init.status ?? 200,
    headers: init.headers ?? {},
  });
}

describe('probe outcome classifier', () => {
  it('maps NetworkError to nde-probe:NetworkError', () => {
    const verdict = classify(
      new NetworkError('https://example.org/x', 'DNS lookup failed', 12),
    );
    expect(verdict.success).toBe(false);
    expect(verdict.outcome?.equals(probeOutcomes.NetworkError)).toBe(true);
    expect(verdict.detail).toBe('DNS lookup failed');
  });

  it('maps HTTP 404 to nde-probe:NotFound', () => {
    const result = new DataDumpProbeResult(
      'https://example.org/x',
      mockResponse({ status: 404, headers: { 'Content-Type': 'text/html' } }),
      10,
    );
    const verdict = classify(result);
    expect(verdict.outcome?.equals(probeOutcomes.NotFound)).toBe(true);
  });

  it('maps HTTP 503 to nde-probe:ServerError', () => {
    const result = new DataDumpProbeResult(
      'https://example.org/x',
      mockResponse({ status: 503 }),
      10,
    );
    const verdict = classify(result);
    expect(verdict.outcome?.equals(probeOutcomes.ServerError)).toBe(true);
  });

  it('maps HTTP 401 / 403 to nde-probe:AuthRequired', () => {
    for (const status of [401, 403]) {
      const verdict = classify(
        new DataDumpProbeResult(
          'https://example.org/x',
          mockResponse({ status }),
          10,
        ),
      );
      expect(verdict.outcome?.equals(probeOutcomes.AuthRequired)).toBe(true);
    }
  });

  it('maps SparqlProbeResult failureReason to nde-probe:SparqlProbeFailed', () => {
    const result = new SparqlProbeResult(
      'https://example.org/sparql',
      mockResponse({
        status: 200,
        headers: { 'Content-Type': 'application/sparql-results+json' },
      }),
      10,
      'application/sparql-results+json',
      'SPARQL endpoint returned invalid JSON',
    );
    const verdict = classify(result);
    expect(verdict.success).toBe(false);
    expect(verdict.outcome?.equals(probeOutcomes.SparqlProbeFailed)).toBe(true);
  });

  it('passes successful probes through', () => {
    const result = new DataDumpProbeResult(
      'https://example.org/x',
      mockResponse({
        status: 200,
        headers: { 'Content-Type': 'text/turtle', 'Content-Length': '4096' },
      }),
      10,
    );
    const verdict = classify(result);
    expect(verdict.success).toBe(true);
    expect(verdict.outcome).toBeNull();
  });

  it('maps HTTP 429 to nde-probe:RateLimited', () => {
    const result = new DataDumpProbeResult(
      'https://example.org/x',
      mockResponse({ status: 429 }),
      10,
    );
    const verdict = classify(result);
    expect(verdict.outcome?.equals(probeOutcomes.RateLimited)).toBe(true);
  });

  it('maps a content-type-mismatch warning on success to ContentTypeMismatch', () => {
    const result = new DataDumpProbeResult(
      'https://example.org/x',
      mockResponse({
        status: 200,
        headers: { 'Content-Type': 'text/turtle' },
      }),
      10,
    );
    result.warnings.push(
      'Server Content-Type text/html does not match declared media type text/turtle',
    );
    const verdict = classify(result);
    expect(verdict.success).toBe(false);
    expect(verdict.outcome?.equals(probeOutcomes.ContentTypeMismatch)).toBe(
      true,
    );
    expect(verdict.detail).toMatch(/Content-Type/);
  });

  it('maps a missing Content-Type header to ContentTypeMissing', () => {
    const result = new DataDumpProbeResult(
      'https://example.org/x',
      mockResponse({ status: 406, headers: {} }),
      10,
    );
    const verdict = classify(result);
    expect(verdict.outcome?.equals(probeOutcomes.ContentTypeMissing)).toBe(
      true,
    );
  });

  it('falls back to ContentTypeMismatch for unhandled non-2xx with content type', () => {
    const result = new DataDumpProbeResult(
      'https://example.org/x',
      mockResponse({
        status: 406,
        headers: { 'Content-Type': 'text/html' },
      }),
      10,
    );
    const verdict = classify(result);
    expect(verdict.outcome?.equals(probeOutcomes.ContentTypeMismatch)).toBe(
      true,
    );
  });

  it('maps an "empty" failureReason to EmptyBody', () => {
    const result = new DataDumpProbeResult(
      'https://example.org/x',
      mockResponse({
        status: 200,
        headers: { 'Content-Type': 'text/turtle' },
      }),
      10,
    );
    (result as { failureReason: string }).failureReason =
      'Distribution contains no RDF triples (empty)';
    const verdict = classify(result);
    expect(verdict.outcome?.equals(probeOutcomes.EmptyBody)).toBe(true);
  });

  it('maps non-empty failureReason on data dump to RdfParseFailed', () => {
    const result = new DataDumpProbeResult(
      'https://example.org/x',
      mockResponse({
        status: 200,
        headers: { 'Content-Type': 'text/turtle' },
      }),
      10,
    );
    (result as { failureReason: string }).failureReason =
      'Unexpected "foo" on line 1';
    const verdict = classify(result);
    expect(verdict.outcome?.equals(probeOutcomes.RdfParseFailed)).toBe(true);
  });
});

describe('DistributionProbeStage', () => {
  beforeEach(() => {
    nock.cleanAll();
  });

  it('emits sh:Violation triples for an unreachable dcat:accessURL', async () => {
    nock('https://example.org').head('/broken').replyWithError('ENOTFOUND');

    const dataset = factory.dataset();
    const datasetNode = factory.namedNode('https://example.org/d1');
    const distributionNode = factory.blankNode();
    const url = factory.namedNode('https://example.org/broken');
    dataset.add(
      factory.quad(datasetNode, dcat('distribution'), distributionNode),
    );
    dataset.add(
      factory.quad(distributionNode, rdf('type'), dcat('Distribution')),
    );
    dataset.add(factory.quad(distributionNode, dcat('accessURL'), url));
    dataset.add(
      factory.quad(
        distributionNode,
        dcat('mediaType'),
        factory.literal('text/turtle'),
      ),
    );

    const stage = new DistributionProbeStage();
    const quads = await stage.run(dataset);

    const violation = quads.find(
      (quad) =>
        quad.predicate.equals(shacl('resultSeverity')) &&
        quad.object.equals(shacl('Violation')),
    );
    expect(violation).toBeDefined();

    const outcome = quads.find((quad) =>
      quad.predicate.equals(factory.namedNode(`${ndeProbePrefix}probeOutcome`)),
    );
    expect(outcome?.object.value).toBe(`${ndeProbePrefix}NetworkError`);

    const resultPath = quads.find((quad) =>
      quad.predicate.equals(shacl('resultPath')),
    );
    expect(resultPath?.object.equals(dcat('accessURL'))).toBe(true);
  });

  it('suppresses the violation when the health store marks the failure as transient', async () => {
    nock('https://example.org').head('/flaky').replyWithError('ETIMEDOUT');

    const dataset = factory.dataset();
    const datasetNode = factory.namedNode('https://example.org/d2');
    const distributionNode = factory.blankNode();
    const url = factory.namedNode('https://example.org/flaky');
    dataset.add(
      factory.quad(datasetNode, dcat('distribution'), distributionNode),
    );
    dataset.add(factory.quad(distributionNode, dcat('accessURL'), url));

    const healthStore = new InMemoryHealthStore();
    const stage = new DistributionProbeStage({
      healthStore,
      failureStreakMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
    });

    const quads = await stage.run(dataset);
    expect(quads).toHaveLength(0); // first failure is transient; no violation emitted.
    const stored = await healthStore.get(new URL(url.value));
    expect(stored?.consecutiveFailures).toBe(1);
  });

  it('promotes to sh:Violation once firstFailureAt is older than failureStreakMaxAgeMs', async () => {
    nock('https://example.org')
      .head('/persistent')
      .times(2)
      .replyWithError('ECONNREFUSED');

    const dataset = factory.dataset();
    const datasetNode = factory.namedNode('https://example.org/d3');
    const distributionNode = factory.blankNode();
    const url = factory.namedNode('https://example.org/persistent');
    dataset.add(
      factory.quad(datasetNode, dcat('distribution'), distributionNode),
    );
    dataset.add(factory.quad(distributionNode, dcat('accessURL'), url));

    const healthStore = new InMemoryHealthStore();
    const stage = new DistributionProbeStage({
      healthStore,
      failureStreakMaxAgeMs: 20,
    });

    const firstRun = await stage.run(dataset);
    expect(firstRun).toHaveLength(0); // streak too young; suppressed.

    await new Promise((resolve) => setTimeout(resolve, 30));

    const quads = await stage.run(dataset); // streak now older than threshold → promoted.

    const violation = quads.find(
      (quad) =>
        quad.predicate.equals(shacl('resultSeverity')) &&
        quad.object.equals(shacl('Violation')),
    );
    expect(violation).toBeDefined();
    const stored = await healthStore.get(new URL(url.value));
    expect(stored?.consecutiveFailures).toBe(2);
  });

  it('clears health state after a successful probe', async () => {
    nock('https://example.org').head('/recovering').replyWithError('ENOTFOUND');
    // Use a large Content-Length so the probe treats the HEAD as authoritative and does
    // not fall back to a GET (which would require a second mock).
    nock('https://example.org').head('/recovering').reply(200, '', {
      'Content-Type': 'text/turtle',
      'Content-Length': '100000',
    });

    const dataset = factory.dataset();
    const datasetNode = factory.namedNode('https://example.org/d4');
    const distributionNode = factory.blankNode();
    const url = factory.namedNode('https://example.org/recovering');
    dataset.add(
      factory.quad(datasetNode, dcat('distribution'), distributionNode),
    );
    dataset.add(factory.quad(distributionNode, dcat('accessURL'), url));
    dataset.add(
      factory.quad(
        distributionNode,
        dcat('mediaType'),
        factory.literal('text/turtle'),
      ),
    );

    const healthStore = new InMemoryHealthStore();
    const stage = new DistributionProbeStage({ healthStore });

    await stage.run(dataset); // failure
    await stage.run(dataset); // success

    const stored = await healthStore.get(new URL(url.value));
    expect(stored?.consecutiveFailures).toBe(0);
    expect(stored?.firstFailureAt).toBeNull();
    expect(stored?.lastSuccessAt).toBeInstanceOf(Date);
  });

  it('caps the number of in-flight probes at probeConcurrency', async () => {
    const distributionCount = 20;
    const concurrencyLimit = 4;
    let inFlight = 0;
    let peakInFlight = 0;
    nock('https://example.org')
      .head(/\/cap-\d+/)
      .times(distributionCount)
      .reply(async function () {
        inFlight++;
        peakInFlight = Math.max(peakInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 20));
        inFlight--;
        return [200, '', { 'Content-Type': 'text/turtle' }];
      });

    const dataset = factory.dataset();
    const datasetNode = factory.namedNode('https://example.org/d-cap');
    for (let index = 0; index < distributionCount; index++) {
      const distributionNode = factory.blankNode();
      dataset.add(
        factory.quad(datasetNode, dcat('distribution'), distributionNode),
      );
      dataset.add(
        factory.quad(
          distributionNode,
          dcat('accessURL'),
          factory.namedNode(`https://example.org/cap-${index}`),
        ),
      );
      dataset.add(
        factory.quad(
          distributionNode,
          dcat('mediaType'),
          factory.literal('text/turtle'),
        ),
      );
    }

    const stage = new DistributionProbeStage({
      probeConcurrency: concurrencyLimit,
    });
    await stage.run(dataset);

    expect(peakInFlight).toBeLessThanOrEqual(concurrencyLimit);
    expect(peakInFlight).toBeGreaterThan(0);
  });

  it('probes schema:contentUrl on a Schema.org distribution', async () => {
    nock('https://example.org')
      .head('/schema-broken')
      .replyWithError('ENOTFOUND');

    const dataset = factory.dataset();
    const datasetNode = factory.namedNode('https://example.org/d-schema');
    const distributionNode = factory.blankNode();
    const contentUrl = factory.namedNode('https://example.org/schema-broken');
    const schema = (property: string) =>
      factory.namedNode(`https://schema.org/${property}`);

    dataset.add(
      factory.quad(datasetNode, schema('distribution'), distributionNode),
    );
    dataset.add(
      factory.quad(distributionNode, schema('contentUrl'), contentUrl),
    );
    dataset.add(
      factory.quad(
        distributionNode,
        schema('encodingFormat'),
        factory.literal('text/turtle'),
      ),
    );

    const stage = new DistributionProbeStage();
    const quads = await stage.run(dataset);

    const resultPath = quads.find((quad) =>
      quad.predicate.equals(shacl('resultPath')),
    );
    expect(resultPath?.object.equals(schema('contentUrl'))).toBe(true);

    const constraint = quads.find((quad) =>
      quad.predicate.equals(shacl('sourceConstraintComponent')),
    );
    expect(constraint?.object.value).toBe(
      `${ndeProbePrefix}DistributionReachableConstraintComponent`,
    );
  });

  it('reads mediaType from dct:format when dcat:mediaType is missing', async () => {
    nock('https://example.org').head('/dctformat').replyWithError('ENOTFOUND');

    const dataset = factory.dataset();
    const datasetNode = factory.namedNode('https://example.org/d-dctformat');
    const distributionNode = factory.blankNode();
    const url = factory.namedNode('https://example.org/dctformat');
    const dct = (property: string) =>
      factory.namedNode(`http://purl.org/dc/terms/${property}`);

    dataset.add(
      factory.quad(datasetNode, dcat('distribution'), distributionNode),
    );
    dataset.add(factory.quad(distributionNode, dcat('accessURL'), url));
    dataset.add(
      factory.quad(
        distributionNode,
        dct('format'),
        factory.literal('text/turtle'),
      ),
    );

    const stage = new DistributionProbeStage();
    const quads = await stage.run(dataset);
    // probe runs; we just need to exercise the dct:format mediaType lookup branch.
    expect(quads.length).toBeGreaterThan(0);
  });

  it('reads mediaType as an IRI (NamedNode) value', async () => {
    nock('https://example.org').head('/iri-mt').replyWithError('ENOTFOUND');

    const dataset = factory.dataset();
    const datasetNode = factory.namedNode('https://example.org/d-iri-mt');
    const distributionNode = factory.blankNode();
    const url = factory.namedNode('https://example.org/iri-mt');

    dataset.add(
      factory.quad(datasetNode, dcat('distribution'), distributionNode),
    );
    dataset.add(factory.quad(distributionNode, dcat('accessURL'), url));
    dataset.add(
      factory.quad(
        distributionNode,
        dcat('mediaType'),
        factory.namedNode(
          'https://www.iana.org/assignments/media-types/application/n-triples',
        ),
      ),
    );

    const stage = new DistributionProbeStage();
    const quads = await stage.run(dataset);
    expect(quads.length).toBeGreaterThan(0); // probe ran with IRI mediaType
  });

  it('treats a SPARQL mediaType as inferring the SPARQL protocol conformsTo', async () => {
    nock('https://example.org').head('/sparql').replyWithError('ENOTFOUND');

    const dataset = factory.dataset();
    const datasetNode = factory.namedNode('https://example.org/d-sparql');
    const distributionNode = factory.blankNode();
    const url = factory.namedNode('https://example.org/sparql');

    dataset.add(
      factory.quad(datasetNode, dcat('distribution'), distributionNode),
    );
    dataset.add(factory.quad(distributionNode, dcat('accessURL'), url));
    dataset.add(
      factory.quad(
        distributionNode,
        dcat('mediaType'),
        factory.literal('application/sparql-query'),
      ),
    );

    const stage = new DistributionProbeStage();
    const quads = await stage.run(dataset);
    expect(quads.length).toBeGreaterThan(0); // probe ran with SPARQL conformsTo derived
  });
});

class InMemoryHealthStore implements DistributionHealthStore {
  private readonly records = new Map<string, DistributionHealthRecord>();

  public async get(url: URL): Promise<DistributionHealthRecord | null> {
    return this.records.get(url.toString()) ?? null;
  }

  public async store(record: DistributionHealthRecord): Promise<void> {
    this.records.set(record.url.toString(), record);
  }

  public async delete(url: URL): Promise<void> {
    this.records.delete(url.toString());
  }
}
