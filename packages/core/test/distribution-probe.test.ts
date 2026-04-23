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

const ndePrefix = 'https://def.nde.nl#';

function mockResponse(
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(null, {
    status: init.status ?? 200,
    headers: init.headers ?? {},
  });
}

describe('probe outcome classifier', () => {
  it('maps NetworkError to nde:NetworkError', () => {
    const verdict = classify(
      new NetworkError('https://example.org/x', 'DNS lookup failed', 12),
    );
    expect(verdict.success).toBe(false);
    expect(verdict.outcome?.equals(probeOutcomes.NetworkError)).toBe(true);
    expect(verdict.detail).toBe('DNS lookup failed');
  });

  it('maps HTTP 404 to nde:NotFound', () => {
    const result = new DataDumpProbeResult(
      'https://example.org/x',
      mockResponse({ status: 404, headers: { 'Content-Type': 'text/html' } }),
      10,
    );
    const verdict = classify(result);
    expect(verdict.outcome?.equals(probeOutcomes.NotFound)).toBe(true);
  });

  it('maps HTTP 503 to nde:ServerError', () => {
    const result = new DataDumpProbeResult(
      'https://example.org/x',
      mockResponse({ status: 503 }),
      10,
    );
    const verdict = classify(result);
    expect(verdict.outcome?.equals(probeOutcomes.ServerError)).toBe(true);
  });

  it('maps HTTP 401 / 403 to nde:AuthRequired', () => {
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

  it('maps SparqlProbeResult failureReason to nde:SparqlProbeFailed', () => {
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
      quad.predicate.equals(factory.namedNode(`${ndePrefix}probeOutcome`)),
    );
    expect(outcome?.object.value).toBe(`${ndePrefix}NetworkError`);

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
      consecutiveFailureThreshold: 3,
      failureStreakMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
    });

    const quads = await stage.run(dataset);
    expect(quads).toHaveLength(0); // first failure is transient; no violation emitted.
    const stored = await healthStore.get(new URL(url.value));
    expect(stored?.consecutiveFailures).toBe(1);
  });

  it('promotes to sh:Violation once consecutiveFailures reaches the threshold', async () => {
    nock('https://example.org')
      .head('/persistent')
      .times(3)
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
      consecutiveFailureThreshold: 3,
      failureStreakMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
    });

    await stage.run(dataset);
    await stage.run(dataset);
    const quads = await stage.run(dataset); // third failure → promoted.

    const violation = quads.find(
      (quad) =>
        quad.predicate.equals(shacl('resultSeverity')) &&
        quad.object.equals(shacl('Violation')),
    );
    expect(violation).toBeDefined();
    const stored = await healthStore.get(new URL(url.value));
    expect(stored?.consecutiveFailures).toBe(3);
  });

  it('clears health state after a successful probe', async () => {
    nock('https://example.org').head('/recovering').replyWithError('ENOTFOUND');
    // Use a large Content-Length so the probe treats the HEAD as authoritative and does
    // not fall back to a GET (which would require a second mock).
    nock('https://example.org')
      .head('/recovering')
      .reply(200, '', {
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
