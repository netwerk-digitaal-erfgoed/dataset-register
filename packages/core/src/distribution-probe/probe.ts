import factory from 'rdf-ext';
import type {
  BlankNode,
  DatasetCore,
  NamedNode,
  Quad,
  Term,
} from '@rdfjs/types';
import { Distribution, IANA_MEDIA_TYPE_PREFIX } from '@lde/dataset';
import { probe as probeDistribution } from '@lde/distribution-probe';
import type { ProbeResultType } from '@lde/distribution-probe';
import { dcat, dct, rdf, xsd } from '../query.ts';
import { shacl } from '../validator.ts';
import { classify, ndeProbe, probeOutcomes } from './outcomes.ts';
import type { ProbeVerdict } from './outcomes.ts';
import type {
  DistributionHealthRecord,
  DistributionHealthStore,
} from '../distribution-health-store.ts';

const schema = (property: string): NamedNode =>
  factory.namedNode(`https://schema.org/${property}`);

const SPARQL_PROTOCOL_URL = 'https://www.w3.org/TR/sparql11-protocol/';
const DEFAULT_TIMEOUT_MS = 5000;

export interface DistributionProbeStageOptions {
  /**
   * When set, each failing probe is assessed against this store and promoted to
   * sh:Violation only once the firstFailureAt timestamp is older than
   * failureStreakMaxAgeMs. When null, every failure is emitted at sh:Violation
   * (the registration path).
   */
  healthStore?: DistributionHealthStore | null;
  /**
   * Per-probe timeout in milliseconds. Defaults to 5000.
   */
  timeoutMs?: number;
  /**
   * Minimum age of a failure streak (ms) before the health store promotes a probe to
   * sh:Violation. Operators tune this relative to crawl cadence. Default 7 days.
   */
  failureStreakMaxAgeMs?: number;
  /**
   * Maximum number of distribution probes to run in parallel. Bounded because a dataset
   * can declare thousands of distributions and an unbounded fan-out exhausts sockets,
   * trips rate limiters on the target host, and starves the event loop. Default 20.
   */
  probeConcurrency?: number;
}

const DEFAULT_FAILURE_STREAK_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_PROBE_CONCURRENCY = 20;

interface DistributionCandidate {
  distributionNode: NamedNode | BlankNode;
  urlNode: NamedNode;
  path: NamedNode;
  mediaType: string | undefined;
  conformsTo: URL | undefined;
}

/**
 * Probes every distribution URL in the input graph and emits sh:ValidationResult triples
 * describing reachability and content-type-match failures. Results are merged into a
 * dataset the caller can concatenate with a SHACL validation report.
 */
export class DistributionProbeStage {
  private readonly healthStore: DistributionHealthStore | null;
  private readonly timeoutMs: number;
  private readonly failureStreakMaxAgeMs: number;
  private readonly probeConcurrency: number;

  public constructor(options: DistributionProbeStageOptions = {}) {
    this.healthStore = options.healthStore ?? null;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.failureStreakMaxAgeMs =
      options.failureStreakMaxAgeMs ?? DEFAULT_FAILURE_STREAK_MAX_AGE_MS;
    this.probeConcurrency =
      options.probeConcurrency ?? DEFAULT_PROBE_CONCURRENCY;
  }

  public async run(input: DatasetCore): Promise<Quad[]> {
    const candidates = collectDistributions(input);
    if (candidates.length === 0) return [];

    const probed = await allSettledLimited(
      candidates,
      this.probeConcurrency,
      (candidate) => this.probeCandidate(candidate),
    );

    const quads: Quad[] = [];
    for (let index = 0; index < probed.length; index++) {
      const settled = probed[index];
      const candidate = candidates[index];
      if (settled.status === 'rejected') {
        quads.push(
          ...emitViolation(
            candidate,
            {
              success: false,
              outcome: probeOutcomes.NetworkError,
              detail: String(settled.reason),
            },
            null,
          ),
        );
        continue;
      }
      const { verdict, record } = settled.value;
      if (verdict.success) continue;

      quads.push(...emitViolation(candidate, verdict, record));
    }

    return quads;
  }

  private async probeCandidate(candidate: DistributionCandidate): Promise<{
    verdict: ProbeVerdict;
    record: DistributionHealthRecord | null;
  }> {
    const distribution = toLdeDistribution(candidate);
    const result: ProbeResultType = await probeDistribution(distribution, {
      timeoutMs: this.timeoutMs,
    });
    const verdict = classify(result);

    if (this.healthStore === null) {
      return { verdict, record: null };
    }

    const record = await this.updateHealth(candidate.urlNode, verdict);
    return { verdict: this.applyPromotion(verdict, record), record };
  }

  private async updateHealth(
    url: NamedNode,
    verdict: ProbeVerdict,
  ): Promise<DistributionHealthRecord> {
    const store = this.healthStore;
    if (store === null) {
      throw new Error('healthStore is required');
    }
    const probeUrl = new URL(url.value);
    const now = new Date();
    const existing = await store.get(probeUrl);

    if (verdict.success) {
      const record: DistributionHealthRecord = {
        url: probeUrl,
        lastProbedAt: now,
        lastOutcome: null,
        lastSuccessAt: now,
        firstFailureAt: null,
        consecutiveFailures: 0,
      };
      await store.store(record);
      return record;
    }

    const record: DistributionHealthRecord = {
      url: probeUrl,
      lastProbedAt: now,
      lastOutcome: verdict.outcome,
      lastSuccessAt: existing?.lastSuccessAt ?? null,
      firstFailureAt: existing?.firstFailureAt ?? now,
      consecutiveFailures: (existing?.consecutiveFailures ?? 0) + 1,
    };
    await store.store(record);
    return record;
  }

  private applyPromotion(
    verdict: ProbeVerdict,
    record: DistributionHealthRecord,
  ): ProbeVerdict {
    if (verdict.success) return verdict;

    const streakAgeMs =
      record.firstFailureAt === null
        ? 0
        : Date.now() - record.firstFailureAt.getTime();

    const persistent = streakAgeMs >= this.failureStreakMaxAgeMs;

    return persistent ? verdict : { ...verdict, success: true };
  }
}

function collectDistributions(input: DatasetCore): DistributionCandidate[] {
  const candidates: DistributionCandidate[] = [];

  for (const quad of input) {
    const isDcat =
      quad.predicate.value === dcat('distribution').value &&
      quad.object.termType !== 'Literal';
    const isSchema =
      quad.predicate.value === schema('distribution').value &&
      quad.object.termType !== 'Literal';

    if (!isDcat && !isSchema) continue;

    const distributionNode = quad.object;
    if (
      distributionNode.termType !== 'NamedNode' &&
      distributionNode.termType !== 'BlankNode'
    ) {
      continue;
    }
    candidates.push(
      ...candidatesFor(input, distributionNode, isDcat ? 'dcat' : 'schema'),
    );
  }

  return candidates;
}

function candidatesFor(
  input: DatasetCore,
  distributionNode: NamedNode | BlankNode,
  profile: 'dcat' | 'schema',
): DistributionCandidate[] {
  const mediaType =
    literalValue(input, distributionNode, dcat('mediaType')) ??
    literalValue(input, distributionNode, dct('format')) ??
    literalValue(input, distributionNode, schema('encodingFormat'));
  const conformsTo =
    iriValue(input, distributionNode, dct('conformsTo')) ??
    iriValue(input, distributionNode, schema('usageInfo'));

  const urlPaths: NamedNode[] =
    profile === 'dcat'
      ? [dcat('accessURL'), dcat('downloadURL')]
      : [schema('contentUrl')];

  const found: DistributionCandidate[] = [];
  for (const path of urlPaths) {
    for (const urlTerm of iriValues(input, distributionNode, path)) {
      found.push({
        distributionNode,
        urlNode: urlTerm,
        path,
        mediaType,
        conformsTo,
      });
    }
  }
  return found;
}

function iriValues(
  input: DatasetCore,
  subject: Term,
  predicate: NamedNode,
): NamedNode[] {
  const values: NamedNode[] = [];
  for (const quad of input) {
    if (
      quad.subject.equals(subject) &&
      quad.predicate.equals(predicate) &&
      quad.object.termType === 'NamedNode'
    ) {
      values.push(quad.object);
    }
  }
  return values;
}

function iriValue(
  input: DatasetCore,
  subject: Term,
  predicate: NamedNode,
): URL | undefined {
  const values = iriValues(input, subject, predicate);
  if (values.length === 0) return undefined;
  try {
    return new URL(values[0].value);
  } catch {
    return undefined;
  }
}

function literalValue(
  input: DatasetCore,
  subject: Term,
  predicate: NamedNode,
): string | undefined {
  for (const quad of input) {
    if (
      quad.subject.equals(subject) &&
      quad.predicate.equals(predicate) &&
      quad.object.termType === 'Literal'
    ) {
      return quad.object.value;
    }
    if (
      quad.subject.equals(subject) &&
      quad.predicate.equals(predicate) &&
      quad.object.termType === 'NamedNode'
    ) {
      return quad.object.value;
    }
  }
  return undefined;
}

function toLdeDistribution(candidate: DistributionCandidate): Distribution {
  const mediaType = candidate.mediaType
    ? candidate.mediaType.startsWith(IANA_MEDIA_TYPE_PREFIX) ||
      candidate.mediaType.startsWith('http://') ||
      candidate.mediaType.startsWith('https://')
      ? candidate.mediaType
      : candidate.mediaType
    : undefined;
  const conformsTo =
    candidate.conformsTo ??
    (mediaType !== undefined && /sparql/i.test(mediaType)
      ? new URL(SPARQL_PROTOCOL_URL)
      : undefined);
  return new Distribution(
    new URL(candidate.urlNode.value),
    mediaType,
    conformsTo,
  );
}

function emitViolation(
  candidate: DistributionCandidate,
  verdict: ProbeVerdict,
  record: DistributionHealthRecord | null,
): Quad[] {
  const resultNode = factory.blankNode();
  const outcome = verdict.outcome ?? probeOutcomes.NetworkError;
  const constraintComponent =
    candidate.path.equals(dcat('mediaType')) ||
    candidate.path.equals(schema('encodingFormat'))
      ? ndeProbe('DistributionFormatMatchConstraintComponent')
      : ndeProbe('DistributionReachableConstraintComponent');

  const quads: Quad[] = [
    factory.quad(resultNode, rdf('type'), shacl('ValidationResult')),
    factory.quad(resultNode, shacl('focusNode'), candidate.distributionNode),
    factory.quad(resultNode, shacl('resultPath'), candidate.path),
    factory.quad(resultNode, shacl('value'), candidate.urlNode),
    factory.quad(resultNode, shacl('resultSeverity'), shacl('Violation')),
    factory.quad(
      resultNode,
      shacl('sourceConstraintComponent'),
      constraintComponent,
    ),
    factory.quad(resultNode, ndeProbe('probeOutcome'), outcome),
  ];

  if (verdict.detail !== null) {
    quads.push(
      factory.quad(
        resultNode,
        shacl('resultMessage'),
        factory.literal(verdict.detail, 'en'),
      ),
    );
  }

  if (record !== null) {
    if (record.firstFailureAt !== null) {
      quads.push(
        factory.quad(
          resultNode,
          ndeProbe('firstFailureAt'),
          factory.literal(record.firstFailureAt.toISOString(), xsd('dateTime')),
        ),
      );
    }
    quads.push(
      factory.quad(
        resultNode,
        ndeProbe('consecutiveFailures'),
        factory.literal(String(record.consecutiveFailures), xsd('integer')),
      ),
    );
  }

  return quads;
}

/**
 * Promise.allSettled with a worker-pool concurrency cap. Preserves input ordering in the
 * returned array. Used to bound the fan-out of distribution probes per dataset.
 */
async function allSettledLimited<TItem, TResult>(
  items: readonly TItem[],
  limit: number,
  task: (item: TItem) => Promise<TResult>,
): Promise<PromiseSettledResult<TResult>[]> {
  const results: PromiseSettledResult<TResult>[] = new Array(items.length);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        results[index] = {
          status: 'fulfilled',
          value: await task(items[index]!),
        };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  };
  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}
