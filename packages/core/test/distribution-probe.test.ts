import { URL } from 'url';
import { performance } from 'node:perf_hooks';
import nock from 'nock';
import factory from 'rdf-ext';
import type { DatasetCore, Quad, Term } from '@rdfjs/types';
import {
  NetworkError,
  SparqlProbeResult,
  DataDumpProbeResult,
} from '@lde/distribution-probe';
import { classify, probeOutcomes } from '../src/distribution-probe/outcomes.js';
import { REACHABILITY_FAILURE_OUTCOMES } from '../src/constants.js';
import {
  DistributionProbeStage,
  readProbeSeverities,
} from '../src/distribution-probe/probe.js';
import { dcat, dct, rdf } from '../src/query.js';
import { shacl } from '../src/validator.js';
import type {
  DistributionHealthRecord,
  DistributionHealthStore,
} from '../src/distribution-health-store.js';

/**
 * Wraps a dataset to count how it is read: every `match()` (the indexed lookup we rely on)
 * and every full `[Symbol.iterator]` scan. Used to prove collection never falls back to
 * scanning the whole graph per distribution, which would be O(distributions × graph size).
 */
class CountingDataset implements DatasetCore {
  public matchCalls = 0;
  public fullScans = 0;

  public constructor(private readonly inner: DatasetCore) {}

  public get size(): number {
    return this.inner.size;
  }

  public add(quad: Quad): this {
    this.inner.add(quad);
    return this;
  }

  public delete(quad: Quad): this {
    this.inner.delete(quad);
    return this;
  }

  public has(quad: Quad): boolean {
    return this.inner.has(quad);
  }

  public match(
    subject?: Term | null,
    predicate?: Term | null,
    object?: Term | null,
    graph?: Term | null,
  ): DatasetCore {
    this.matchCalls++;
    return this.inner.match(subject, predicate, object, graph);
  }

  public [Symbol.iterator](): Iterator<Quad> {
    this.fullScans++;
    return this.inner[Symbol.iterator]();
  }
}

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

  it('explains a SPARQL endpoint that returns an HTML web page', () => {
    const result = new SparqlProbeResult(
      'https://example.org/sparql',
      mockResponse({
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }),
      10,
      'application/sparql-results+json',
    );
    const verdict = classify(result);
    expect(verdict.success).toBe(false);
    expect(verdict.outcome?.equals(probeOutcomes.ContentTypeMismatch)).toBe(
      true,
    );
    expect(verdict.detail).toMatch(/text\/html/);
    expect(verdict.detail).toMatch(/web page/);
    expect(verdict.sparqlWebPage).toBe(true);
  });

  it('names the actual content type for a non-HTML SPARQL mismatch', () => {
    const result = new SparqlProbeResult(
      'https://example.org/sparql',
      mockResponse({
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      }),
      10,
      'application/sparql-results+json',
    );
    const verdict = classify(result);
    expect(verdict.success).toBe(false);
    expect(verdict.outcome?.equals(probeOutcomes.ContentTypeMismatch)).toBe(
      true,
    );
    expect(verdict.detail).toMatch(/text\/plain/);
    expect(verdict.detail).not.toMatch(/web page/);
    expect(verdict.sparqlWebPage).toBe(false);
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

  it('tells a DCAT publisher to move a SPARQL query UI to foaf:page', async () => {
    nock('https://example.org')
      .post('/sparql')
      .reply(200, '<!doctype html><html><body>YASGUI</body></html>', {
        'Content-Type': 'text/html; charset=utf-8',
      });

    const dataset = factory.dataset();
    const datasetNode = factory.namedNode('https://example.org/ds-dcat');
    const distributionNode = factory.blankNode();
    const url = factory.namedNode('https://example.org/sparql');
    dataset.add(
      factory.quad(datasetNode, dcat('distribution'), distributionNode),
    );
    dataset.add(factory.quad(distributionNode, dcat('accessURL'), url));
    dataset.add(
      factory.quad(
        distributionNode,
        dct('conformsTo'),
        factory.namedNode('https://www.w3.org/TR/sparql11-protocol/'),
      ),
    );

    const quads = await new DistributionProbeStage().run(dataset);
    const message = quads.find((quad) =>
      quad.predicate.equals(shacl('resultMessage')),
    );
    expect(message?.object.value).toMatch(/dcat:accessURL/);
    expect(message?.object.value).toMatch(/foaf:page/);
    expect(message?.object.value).not.toMatch(/schema:documentation/);
  });

  it('tells a Schema.org publisher to move a SPARQL query UI to schema:documentation', async () => {
    nock('https://example.org')
      .post('/sparql')
      .reply(200, '<!doctype html><html></html>', {
        'Content-Type': 'text/html',
      });

    const schema = (property: string) =>
      factory.namedNode(`https://schema.org/${property}`);
    const dataset = factory.dataset();
    const datasetNode = factory.namedNode('https://example.org/ds-schema');
    const distributionNode = factory.blankNode();
    const url = factory.namedNode('https://example.org/sparql');
    dataset.add(
      factory.quad(datasetNode, schema('distribution'), distributionNode),
    );
    dataset.add(factory.quad(distributionNode, schema('contentUrl'), url));
    dataset.add(
      factory.quad(
        distributionNode,
        schema('usageInfo'),
        factory.namedNode('https://www.w3.org/TR/sparql11-protocol/'),
      ),
    );

    const quads = await new DistributionProbeStage().run(dataset);
    const message = quads.find((quad) =>
      quad.predicate.equals(shacl('resultMessage')),
    );
    expect(message?.object.value).toMatch(/schema:documentation/);
    expect(message?.object.value).not.toMatch(/foaf:page/);
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

  it('caps probing at maxProbes distinct endpoints and logs how many were skipped', async () => {
    const distributionCount = 5;
    const maxProbes = 2;
    let probeCount = 0;
    // Each distribution has a distinct accessURL, so it is its own probe endpoint. A large
    // Content-Length keeps the probe on HEAD (no GET fallback), so each probed endpoint
    // maps to exactly one intercepted request.
    nock('https://example.org')
      .head(/\/capped-\d+/)
      .times(distributionCount)
      .reply(() => {
        probeCount++;
        return [
          200,
          '',
          { 'Content-Type': 'text/turtle', 'Content-Length': '100000' },
        ];
      });

    const dataset = factory.dataset();
    const datasetNode = factory.namedNode('https://example.org/d-capped');
    for (let index = 0; index < distributionCount; index++) {
      const distributionNode = factory.blankNode();
      dataset.add(
        factory.quad(datasetNode, dcat('distribution'), distributionNode),
      );
      dataset.add(
        factory.quad(
          distributionNode,
          dcat('accessURL'),
          factory.namedNode(`https://example.org/capped-${index}`),
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

    const messages: string[] = [];
    const stage = new DistributionProbeStage({
      maxProbes,
      logger: { warn: (message) => messages.push(message) },
    });
    await stage.run(dataset);

    expect(probeCount).toBe(maxProbes); // only the first maxProbes endpoints are probed.
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('skipped 3');
  });

  it('caps probing without a logger and does not throw', async () => {
    const maxProbes = 1;
    let probeCount = 0;
    nock('https://example.org')
      .head(/\/nolog-\d+/)
      .times(3)
      .reply(() => {
        probeCount++;
        return [
          200,
          '',
          { 'Content-Type': 'text/turtle', 'Content-Length': '100000' },
        ];
      });

    const dataset = factory.dataset();
    const datasetNode = factory.namedNode('https://example.org/d-nolog');
    for (let index = 0; index < 3; index++) {
      const distributionNode = factory.blankNode();
      dataset.add(
        factory.quad(datasetNode, dcat('distribution'), distributionNode),
      );
      dataset.add(
        factory.quad(
          distributionNode,
          dcat('accessURL'),
          factory.namedNode(`https://example.org/nolog-${index}`),
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

    const stage = new DistributionProbeStage({ maxProbes }); // no logger passed.
    await stage.run(dataset);

    expect(probeCount).toBe(maxProbes); // cap still enforced without a logger.
  });

  it('yields no candidate for a dangling distribution node with no quads of its own', async () => {
    const dataset = factory.dataset();
    const datasetNode = factory.namedNode('https://example.org/d-dangling');
    const distributionNode = factory.blankNode();
    // The distribution is linked but has no accessURL / mediaType / anything.
    dataset.add(
      factory.quad(datasetNode, dcat('distribution'), distributionNode),
    );

    const stage = new DistributionProbeStage();
    const quads = await stage.run(dataset);

    expect(quads).toHaveLength(0); // nothing to probe, no violation emitted.
  });

  it('ignores a distribution link whose object is a literal', async () => {
    const dataset = factory.dataset();
    const datasetNode = factory.namedNode('https://example.org/d-literal-dist');
    // A malformed `dcat:distribution "text"` — the object is not a node, so it is skipped.
    dataset.add(
      factory.quad(
        datasetNode,
        dcat('distribution'),
        factory.literal('not a distribution node'),
      ),
    );

    const stage = new DistributionProbeStage();
    const quads = await stage.run(dataset);

    expect(quads).toHaveLength(0);
  });

  it('ignores a distribution mediaType that is a blank node (neither literal nor IRI)', async () => {
    const dataset = factory.dataset();
    const datasetNode = factory.namedNode('https://example.org/d-bnode-mt');
    const distributionNode = factory.blankNode();
    dataset.add(
      factory.quad(datasetNode, dcat('distribution'), distributionNode),
    );
    // mediaType points to a blank node, which literalValue must skip; with no URL to
    // probe, no candidate is produced.
    dataset.add(
      factory.quad(distributionNode, dcat('mediaType'), factory.blankNode()),
    );

    const stage = new DistributionProbeStage();
    const quads = await stage.run(dataset);

    expect(quads).toHaveLength(0);
  });

  // Regression guard: collection must resolve distribution properties through the dataset's
  // index (match()), never by scanning the whole graph per distribution. See the doc comment
  // on collectDistributions; a regression here reintroduces the O(distributions × graph)
  // stall this code was written to remove.
  it('collects distributions through the index without scanning the whole dataset', async () => {
    const inner = factory.dataset();
    const datasetNode = factory.namedNode('https://example.org/d-idx');
    // Distributions without an accessURL: collected (exercising every property lookup) but
    // never probed, so the test needs no network mock.
    for (let index = 0; index < 3; index++) {
      const distributionNode = factory.blankNode();
      inner.add(
        factory.quad(datasetNode, dcat('distribution'), distributionNode),
      );
      inner.add(
        factory.quad(
          distributionNode,
          dcat('mediaType'),
          factory.literal('text/turtle'),
        ),
      );
    }
    const counting = new CountingDataset(inner);

    const stage = new DistributionProbeStage();
    await stage.run(counting);

    // Collection must go through match(); it must never iterate the whole dataset.
    expect(counting.matchCalls).toBeGreaterThan(0);
    expect(counting.fullScans).toBe(0);
  });

  // Regression guard for the dependency: if the dataset ever stops being indexed, match()
  // degrades to a full scan and this collection becomes quadratic (minutes). The generous
  // budget separates O(n) (~hundreds of ms) from O(n²) (minutes) without flaking on slow CI.
  it('collects a large catalogue in roughly linear time', async () => {
    const dataset = factory.dataset();
    const datasetNode = factory.namedNode('https://example.org/d-big');
    const distributionCount = 20000;
    for (let index = 0; index < distributionCount; index++) {
      const distributionNode = factory.blankNode();
      dataset.add(
        factory.quad(datasetNode, dcat('distribution'), distributionNode),
      );
      dataset.add(
        factory.quad(
          distributionNode,
          dcat('mediaType'),
          factory.literal('text/turtle'),
        ),
      );
    }

    const stage = new DistributionProbeStage();
    const start = performance.now();
    const quads = await stage.run(dataset);
    const elapsedMs = performance.now() - start;

    expect(quads).toHaveLength(0); // no accessURL, nothing to probe
    expect(elapsedMs).toBeLessThan(5000); // a quadratic regression would take minutes
  }, 30000);

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

  it('tolerates a malformed dct:conformsTo IRI without crashing the probe', async () => {
    nock('https://example.org')
      .head('/bad-conforms')
      .replyWithError('ENOTFOUND');

    const dataset = factory.dataset();
    const datasetNode = factory.namedNode('https://example.org/d-bad-conforms');
    const distributionNode = factory.blankNode();
    const url = factory.namedNode('https://example.org/bad-conforms');
    const dct = (property: string) =>
      factory.namedNode(`http://purl.org/dc/terms/${property}`);

    dataset.add(
      factory.quad(datasetNode, dcat('distribution'), distributionNode),
    );
    dataset.add(factory.quad(distributionNode, dcat('accessURL'), url));
    dataset.add(
      // A NamedNode whose value isn’t a parsable URL — exercises iriValue’s catch.
      factory.quad(
        distributionNode,
        dct('conformsTo'),
        factory.namedNode('not a url'),
      ),
    );

    const stage = new DistributionProbeStage();
    const quads = await stage.run(dataset);
    expect(quads.length).toBeGreaterThan(0);
  });

  it('records a rejected probe when the health store throws', async () => {
    nock('https://example.org')
      .head('/store-throws')
      .replyWithError('ENOTFOUND');

    const dataset = factory.dataset();
    const datasetNode = factory.namedNode('https://example.org/d-store-throws');
    const distributionNode = factory.blankNode();
    const url = factory.namedNode('https://example.org/store-throws');
    dataset.add(
      factory.quad(datasetNode, dcat('distribution'), distributionNode),
    );
    dataset.add(factory.quad(distributionNode, dcat('accessURL'), url));

    const throwingStore: DistributionHealthStore = {
      get: async () => {
        throw new Error('store unavailable');
      },
      store: async () => {
        throw new Error('store unavailable');
      },
      delete: async () => {
        throw new Error('store unavailable');
      },
    };
    const stage = new DistributionProbeStage({ healthStore: throwingStore });
    const quads = await stage.run(dataset);

    // The worker should catch the error and still emit a NetworkError violation.
    const outcome = quads.find((quad) =>
      quad.predicate.equals(factory.namedNode(`${ndeProbePrefix}probeOutcome`)),
    );
    expect(outcome?.object.value).toBe(`${ndeProbePrefix}NetworkError`);
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

  it('probes a shared SPARQL endpoint once and reuses the verdict across distributions', async () => {
    let postCount = 0;
    nock('https://example.org')
      .post('/sparql')
      .times(2) // permit a second request so a regression is a counted call, not a nock error
      .reply(() => {
        postCount++;
        return [429, '', { 'Content-Type': 'application/sparql-results+json' }];
      });

    const dataset = factory.dataset();
    const datasetNode = factory.namedNode(
      'https://example.org/d-shared-sparql',
    );
    // Two distributions point at one endpoint, differing only by the #query fragment
    // that fetch() strips before the request — the classic SPARQL-explorer pattern.
    for (const fragment of ['#query=one', '#query=two']) {
      const distributionNode = factory.blankNode();
      dataset.add(
        factory.quad(datasetNode, dcat('distribution'), distributionNode),
      );
      dataset.add(
        factory.quad(
          distributionNode,
          dcat('accessURL'),
          factory.namedNode(`https://example.org/sparql${fragment}`),
        ),
      );
      dataset.add(
        factory.quad(
          distributionNode,
          dcat('mediaType'),
          factory.literal('application/sparql-query'),
        ),
      );
    }

    const stage = new DistributionProbeStage();
    const quads = await stage.run(dataset);

    expect(postCount).toBe(1); // the two distributions collapse to a single probe

    // Each distribution still receives its own result carrying the shared verdict.
    const violations = quads.filter(
      (quad) =>
        quad.predicate.equals(shacl('resultSeverity')) &&
        quad.object.equals(shacl('Violation')),
    );
    expect(violations).toHaveLength(2);

    const outcomes = quads.filter((quad) =>
      quad.predicate.equals(factory.namedNode(`${ndeProbePrefix}probeOutcome`)),
    );
    expect(outcomes).toHaveLength(2);
    outcomes.forEach((quad) =>
      expect(quad.object.value).toBe(`${ndeProbePrefix}RateLimited`),
    );
  });

  it('detects a SPARQL endpoint declared via dct:conformsTo without a media type', async () => {
    let postCount = 0;
    nock('https://example.org')
      .post('/sparql-c')
      .reply(() => {
        postCount++;
        return [429, ''];
      });

    const dataset = factory.dataset();
    const datasetNode = factory.namedNode('https://example.org/d-conformsto');
    const distributionNode = factory.blankNode();
    const dct = (property: string) =>
      factory.namedNode(`http://purl.org/dc/terms/${property}`);

    dataset.add(
      factory.quad(datasetNode, dcat('distribution'), distributionNode),
    );
    dataset.add(
      factory.quad(
        distributionNode,
        dcat('accessURL'),
        factory.namedNode('https://example.org/sparql-c'),
      ),
    );
    dataset.add(
      factory.quad(
        distributionNode,
        dct('conformsTo'),
        factory.namedNode('https://www.w3.org/TR/sparql11-protocol/'),
      ),
    );

    const stage = new DistributionProbeStage();
    const quads = await stage.run(dataset);

    expect(postCount).toBe(1); // probed as SPARQL (POST), not a data dump (HEAD)
    const outcome = quads.find((quad) =>
      quad.predicate.equals(factory.namedNode(`${ndeProbePrefix}probeOutcome`)),
    );
    expect(outcome?.object.value).toBe(`${ndeProbePrefix}RateLimited`);
  });

  it('tolerates a malformed dcat:accessURL without crashing the probe', async () => {
    const dataset = factory.dataset();
    const datasetNode = factory.namedNode('https://example.org/d-bad-url');
    const distributionNode = factory.blankNode();

    dataset.add(
      factory.quad(datasetNode, dcat('distribution'), distributionNode),
    );
    dataset.add(
      // A NamedNode whose value isn’t a parsable URL — exercises canonicalProbeUrl’s catch.
      factory.quad(
        distributionNode,
        dcat('accessURL'),
        factory.namedNode('not a url'),
      ),
    );

    const stage = new DistributionProbeStage();
    const quads = await stage.run(dataset);
    expect(quads.length).toBeGreaterThan(0); // emits a NetworkError violation, no throw
  });

  it('emits the declared reachability severity instead of a hardcoded Violation', async () => {
    nock('https://example.org').head('/warn').replyWithError('ENOTFOUND');

    const dataset = factory.dataset();
    const datasetNode = factory.namedNode('https://example.org/d-sev');
    const distributionNode = factory.blankNode();
    dataset.add(
      factory.quad(datasetNode, dcat('distribution'), distributionNode),
    );
    dataset.add(
      factory.quad(
        distributionNode,
        dcat('accessURL'),
        factory.namedNode('https://example.org/warn'),
      ),
    );

    const stage = new DistributionProbeStage({
      severities: { reachable: shacl('Warning'), formatMatch: shacl('Info') },
    });
    const quads = await stage.run(dataset);

    const severity = quads.find((quad) =>
      quad.predicate.equals(shacl('resultSeverity')),
    );
    expect(severity?.object.equals(shacl('Warning'))).toBe(true);
    const constraint = quads.find((quad) =>
      quad.predicate.equals(shacl('sourceConstraintComponent')),
    );
    expect(constraint?.object.value).toBe(
      `${ndeProbePrefix}DistributionReachableConstraintComponent`,
    );
  });

  it('emits the format-match severity and constraint for a content-type mismatch', async () => {
    // A large Content-Length keeps the probe on HEAD; the served type contradicts the declared
    // one, so the verdict is a ContentTypeMismatch — the format-match check, not reachability.
    nock('https://example.org').head('/typed').reply(200, '', {
      'Content-Type': 'application/json',
      'Content-Length': '100000',
    });

    const dataset = factory.dataset();
    const datasetNode = factory.namedNode('https://example.org/d-fmt');
    const distributionNode = factory.blankNode();
    dataset.add(
      factory.quad(datasetNode, dcat('distribution'), distributionNode),
    );
    dataset.add(
      factory.quad(
        distributionNode,
        dcat('accessURL'),
        factory.namedNode('https://example.org/typed'),
      ),
    );
    dataset.add(
      factory.quad(
        distributionNode,
        dcat('mediaType'),
        factory.literal('text/turtle'),
      ),
    );

    const stage = new DistributionProbeStage({
      severities: { reachable: shacl('Warning'), formatMatch: shacl('Info') },
    });
    const quads = await stage.run(dataset);

    const outcome = quads.find((quad) =>
      quad.predicate.equals(factory.namedNode(`${ndeProbePrefix}probeOutcome`)),
    );
    expect(outcome?.object.value).toBe(`${ndeProbePrefix}ContentTypeMismatch`);
    const severity = quads.find((quad) =>
      quad.predicate.equals(shacl('resultSeverity')),
    );
    expect(severity?.object.equals(shacl('Info'))).toBe(true);
    const constraint = quads.find((quad) =>
      quad.predicate.equals(shacl('sourceConstraintComponent')),
    );
    expect(constraint?.object.value).toBe(
      `${ndeProbePrefix}DistributionFormatMatchConstraintComponent`,
    );
  });
});

describe('readProbeSeverities', () => {
  const probeMarker = (property: string) =>
    factory.namedNode(`${ndeProbePrefix}${property}`);

  const shapeWithMarker = (
    graph: ReturnType<typeof factory.dataset>,
    marker: string,
    severity: ReturnType<typeof shacl>,
  ) => {
    const shape = factory.blankNode();
    graph.add(
      factory.quad(shape, probeMarker(marker), factory.literal('true')),
    );
    graph.add(factory.quad(shape, shacl('severity'), severity));
  };

  it('reads the sh:severity declared for each probe check', () => {
    const graph = factory.dataset();
    shapeWithMarker(graph, 'probeReachable', shacl('Warning'));
    shapeWithMarker(graph, 'probeFormatMatch', shacl('Warning'));

    const severities = readProbeSeverities(graph);
    expect(severities.reachable.equals(shacl('Warning'))).toBe(true);
    expect(severities.formatMatch.equals(shacl('Warning'))).toBe(true);
  });

  it('falls back to sh:Violation when a check has no marked shape', () => {
    const graph = factory.dataset();
    shapeWithMarker(graph, 'probeReachable', shacl('Warning'));

    const severities = readProbeSeverities(graph);
    expect(severities.reachable.equals(shacl('Warning'))).toBe(true);
    expect(severities.formatMatch.equals(shacl('Violation'))).toBe(true);
  });

  it('falls back to sh:Violation when marked shapes declare conflicting severities', () => {
    const graph = factory.dataset();
    shapeWithMarker(graph, 'probeReachable', shacl('Warning'));
    shapeWithMarker(graph, 'probeReachable', shacl('Info'));

    const severities = readProbeSeverities(graph);
    expect(severities.reachable.equals(shacl('Violation'))).toBe(true);
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

describe('REACHABILITY_FAILURE_OUTCOMES', () => {
  it('lists only real probe outcome IRIs', () => {
    const known = new Set(
      Object.values(probeOutcomes).map((outcome) => outcome.value),
    );
    for (const outcome of REACHABILITY_FAILURE_OUTCOMES) {
      expect(known.has(outcome)).toBe(true);
    }
  });

  it('excludes the content-type outcomes, which never affect reachability', () => {
    expect(REACHABILITY_FAILURE_OUTCOMES).not.toContain(
      probeOutcomes.ContentTypeMismatch.value,
    );
    expect(REACHABILITY_FAILURE_OUTCOMES).not.toContain(
      probeOutcomes.ContentTypeMissing.value,
    );
  });

  it('covers every probe outcome except the content-type ones', () => {
    const reachability = new Set(REACHABILITY_FAILURE_OUTCOMES);
    const contentType = new Set([
      probeOutcomes.ContentTypeMismatch.value,
      probeOutcomes.ContentTypeMissing.value,
    ]);
    for (const outcome of Object.values(probeOutcomes)) {
      const expected = !contentType.has(outcome.value);
      expect(reachability.has(outcome.value)).toBe(expected);
    }
  });
});
