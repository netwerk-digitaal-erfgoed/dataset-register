import factory from 'rdf-ext';
import type {
  BlankNode,
  DatasetCore,
  NamedNode,
  Quad,
  Term,
} from '@rdfjs/types';
import { Distribution } from '@lde/dataset';
import { probeMany } from '@lde/distribution-probe';
import { DataDumpProbeResult } from '@lde/distribution-probe';
import type { ProbeResultType } from '@lde/distribution-probe';
import { probeResultToVerdict } from '@lde/distribution-health';
import type { ValidityVerdict } from '@lde/distribution-health';
import { sourceFingerprint } from '@lde/pipeline';
import { dcat, dct, rdf, xsd } from '../query.ts';
import { isDeterministicFailure } from '../constants.ts';
import { shacl } from '../validator.ts';
import { classify, ndeProbe, probeOutcomes } from './outcomes.ts';
import type { ProbeVerdict } from './outcomes.ts';
import type {
  DistributionHealthRecord,
  DistributionHealthStore,
} from '../distribution-health-store.ts';
import type { DistributionValidityStore } from '../distribution-validity-store.ts';
import { distributionValidityQuads } from '../distribution-validity.ts';

const schema = (property: string): NamedNode =>
  factory.namedNode(`https://schema.org/${property}`);

const SPARQL_PROTOCOL_URL = 'https://www.w3.org/TR/sparql11-protocol/';
const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Minimal structural logger used to report skipped probes. Compatible with a pino logger,
 * so callers can pass their existing logger without core depending on pino.
 */
export interface ProbeLogger {
  warn(message: string): void;
}

/**
 * The sh:severity at which each probe check reports a failure. The reachability and format-match
 * severities are read from the SHACL shapes (see {@link readProbeSeverities}) so the requirements
 * graph is the single source of truth: bumping a shape from sh:Warning to sh:Violation changes
 * runtime behaviour — a Warning informs without invalidating the dataset, a Violation invalidates
 * it — with no code change here. The rate-limited severity is the exception (see {@link checkKind}):
 * an HTTP 429 means the Register was throttled while probing, not that the publisher’s distribution
 * is faulty, so it is fixed at sh:Warning in code and never governed by the shapes.
 */
export interface ProbeSeverities {
  /** Reachability failures: network error, 4xx/5xx, SPARQL or RDF-parse failures, empty body. */
  reachable: NamedNode;
  /** The server Content-Type does not match the declared media type. */
  formatMatch: NamedNode;
  /**
   * An endpoint answered HTTP 429 (Too Many Requests): the Register was rate-limited while
   * probing — our infrastructure condition, not a defect in the publisher’s data — so this is
   * always sh:Warning and never invalidates a dataset, on both the registration and crawler paths.
   */
  rateLimited: NamedNode;
}

/**
 * Notified as the probe stage advances: `completed` of `total` distinct endpoints probed. Fired
 * once with `(0, total)` before the first probe so a caller can show a determinate indicator from
 * the start, then once after each probe settles, ending at `(total, total)`. `total` counts only
 * the endpoints actually probed (representatives with a parsable URL), not synthetic candidates.
 */
export type ProbeProgressListener = (completed: number, total: number) => void;

/**
 * Optional timing/counters sink populated by {@link DistributionProbeStage.run}. It lets a caller
 * (the crawler) attribute how long a validation spent on the network (probeMany) versus the
 * health/validity store writes, without the stage depending on a logger. Durations are whole
 * milliseconds; fields are left unset when the stage does no probing (no distributions).
 */
export interface ProbeTiming {
  /** Wall-clock spent in probeMany – the network fan-out across distribution endpoints. */
  networkMs?: number;
  /** Wall-clock spent evaluating results and writing the health/validity records. */
  storeWriteMs?: number;
  /** Distinct endpoints actually probed over the network (after dedup and the maxProbes cap). */
  endpointsProbed?: number;
  /** Distinct endpoints dropped because they exceeded the maxProbes cap. */
  endpointsSkippedBeyondCap?: number;
  /** Probed endpoints whose verdict was a failure. */
  endpointsFailed?: number;
}

export interface DistributionProbeStageOptions {
  /**
   * When set, each failing probe is assessed against this store and emitted only once the
   * firstFailureAt timestamp is older than failureStreakMaxAgeMs; transient blips are
   * suppressed. When null, every failure is emitted (the registration path). Either way the
   * severity of an emitted result is governed by {@link severities}, not by this store.
   */
  healthStore?: DistributionHealthStore | null;
  /**
   * Per-probe timeout in milliseconds. Defaults to 5000.
   */
  timeoutMs?: number;
  /**
   * Minimum age of a failure streak (ms) before the health store stops suppressing a failing
   * probe and lets it be emitted. Operators tune this relative to crawl cadence. Default 7 days.
   */
  failureStreakMaxAgeMs?: number;
  /**
   * Maximum number of distribution probes to run in parallel across all hosts. Bounded
   * because a dataset can declare thousands of distributions and an unbounded fan-out
   * exhausts sockets, buffers too many response bodies, and starves the event loop. The
   * per-host burst that trips a server's rate limiter is bounded separately by
   * {@link probePerHostConcurrency}. Default 20.
   */
  probeConcurrency?: number;
  /**
   * Maximum number of probes to run in parallel against a single host, beneath the global
   * {@link probeConcurrency} cap. Bounded to be a polite client: a catalogue commonly declares
   * many distributions on one host (e.g. a download endpoint per named graph), and firing the
   * full global pool at one server trips its rate limiter (HTTP 429). Passed through to
   * @lde/distribution-probe's probeMany. Default 4.
   */
  probePerHostConcurrency?: number;
  /**
   * Maximum number of distinct distribution endpoints to probe per dataset, applied after
   * candidates are coalesced by probe target. Bounded because a single dataset can declare
   * tens of thousands of distributions; probing every endpoint stalls a crawl pass for hours.
   * Endpoints beyond the cap are skipped (and logged), never silently dropped. Default 100.
   */
  maxProbes?: number;
  /**
   * Optional logger used to report how many distinct endpoints were skipped once the
   * maxProbes cap is reached. When omitted, skipped probes are still bounded but not reported.
   */
  logger?: ProbeLogger | null;
  /**
   * The sh:severity emitted for each probe check. Pass the shapes-derived severities from
   * {@link readProbeSeverities} (as the crawler does) to let the requirements graph govern
   * severity. Omit it to emit every failure at sh:Violation — SHACL's own default severity —
   * regardless of the shapes; this is the strict mode the registration API uses so a faulty
   * distribution invalidates the dataset.
   */
  severities?: ProbeSeverities;
  /**
   * When set, the shallow RDF-validity verdict derived from each data-dump probe is recorded
   * as a DQV/PROV quality measurement in this store (the validity rail, PRD #2103). Both valid
   * and invalid verdicts are recorded, per distribution attempted, independent of the dataset's
   * overall outcome. When null (the registration API path), no measurement is persisted; instead
   * an invalid verdict surfaces as a sh:Violation in the returned report so registration rejects.
   */
  validityStore?: DistributionValidityStore | null;
  /**
   * IRI of the software credited as the producer (prov:wasAssociatedWith) of the validity
   * verdicts this stage records. Defaults to the Dataset Register crawler.
   */
  producerAgent?: string;
}

const DEFAULT_FAILURE_STREAK_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_PROBE_CONCURRENCY = 20;
const DEFAULT_PROBE_PER_HOST_CONCURRENCY = 4;
const DEFAULT_MAX_PROBES = 100;
const DEFAULT_PRODUCER_AGENT =
  'https://datasetregister.netwerkdigitaalerfgoed.nl/#crawler';

export interface DistributionCandidate {
  distributionNode: NamedNode | BlankNode;
  urlNode: NamedNode;
  path: NamedNode;
  /**
   * The LDE Distribution this candidate probes, built once so the dedup key and the probe
   * agree by construction. Null when the access URL is not a parsable URL.
   */
  distribution: Distribution | null;
}

/**
 * Probes every distribution URL in the input graph and emits sh:ValidationResult triples
 * describing reachability and content-type-match failures. Results are merged into a
 * dataset the caller can concatenate with a SHACL validation report.
 */
export class DistributionProbeStage {
  private readonly healthStore: DistributionHealthStore | null;
  private readonly validityStore: DistributionValidityStore | null;
  private readonly producerAgent: string;
  private readonly timeoutMs: number;
  private readonly failureStreakMaxAgeMs: number;
  private readonly probeConcurrency: number;
  private readonly probePerHostConcurrency: number;
  private readonly maxProbes: number;
  private readonly logger: ProbeLogger | null;
  private readonly severities: ProbeSeverities;

  public constructor(options: DistributionProbeStageOptions = {}) {
    this.healthStore = options.healthStore ?? null;
    this.validityStore = options.validityStore ?? null;
    this.producerAgent = options.producerAgent ?? DEFAULT_PRODUCER_AGENT;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.failureStreakMaxAgeMs =
      options.failureStreakMaxAgeMs ?? DEFAULT_FAILURE_STREAK_MAX_AGE_MS;
    this.probeConcurrency =
      options.probeConcurrency ?? DEFAULT_PROBE_CONCURRENCY;
    this.probePerHostConcurrency =
      options.probePerHostConcurrency ?? DEFAULT_PROBE_PER_HOST_CONCURRENCY;
    this.maxProbes = options.maxProbes ?? DEFAULT_MAX_PROBES;
    this.logger = options.logger ?? null;
    this.severities = options.severities ?? {
      reachable: shacl('Violation'),
      formatMatch: shacl('Violation'),
      // A 429 is the Register being throttled, never a publisher defect, so it stays a Warning
      // even on this strict path where every other probe failure falls back to a Violation.
      rateLimited: shacl('Warning'),
    };
  }

  public async run(
    input: DatasetCore,
    onProgress?: ProbeProgressListener,
    timing?: ProbeTiming,
  ): Promise<Quad[]> {
    const candidates = collectDistributions(input);
    if (candidates.length === 0) return [];

    // Distributions frequently resolve to the same probe: a dataset commonly declares
    // one SPARQL endpoint across many distributions that differ only by a #query
    // fragment (which fetch() strips before the request) or by legacy dcat:mediaType
    // vs. dct:conformsTo. Probing each separately reissues an identical query and trips
    // the host's rate limiter, so we coalesce candidates into one probe per endpoint and
    // reuse the verdict for every member.
    const allGroups = groupByProbeTarget(candidates);

    // Cap the number of distinct endpoints probed. Dedup runs first so the cap is spent on
    // genuinely different endpoints, never on duplicates; a dataset can declare tens of
    // thousands of distributions and probing every endpoint stalls a crawl pass for hours.
    const groups = allGroups.slice(0, this.maxProbes);
    const skipped = allGroups.length - groups.length;
    if (timing) timing.endpointsSkippedBeyondCap = skipped;
    if (skipped > 0) {
      this.logger?.warn(
        `Probing ${groups.length} of ${allGroups.length} distinct distribution endpoints; skipped ${skipped} beyond the cap of ${this.maxProbes}`,
      );
    }

    // Probe every distinct endpoint — bounding total fan-out and the per-host burst so a
    // catalogue with many distributions on one server does not trip its rate limiter — then
    // evaluate each result into a verdict (and health/validity records).
    const evaluated = await this.probeGroups(groups, onProgress, timing);
    if (timing) {
      // Count failures only among network-probed endpoints (those with a parsable
      // URL), so endpointsFailed can never exceed endpointsProbed. Groups whose
      // access URL does not parse never reach the network and are excluded from
      // both counts.
      timing.endpointsFailed = evaluated.filter(
        (entry, index) =>
          groups[index].representative.distribution !== null &&
          !entry.verdict.success,
      ).length;
    }

    const quads: Quad[] = [];
    for (let index = 0; index < groups.length; index++) {
      const { members } = groups[index];
      const { verdict, record, validityVerdict } = evaluated[index];

      for (const member of members) {
        if (!verdict.success) {
          quads.push(
            ...emitProbeResult(member, verdict, record, this.severities),
          );
        }
        // When validity is not being persisted (the registration path), an
        // invalid shallow verdict surfaces as a sh:Violation so registration
        // rejects the distribution with the parse reason. When a validity store
        // is configured (the crawler path) the verdict is recorded as a DQV
        // measurement instead (see probeCandidate). Keying on validityStore —
        // not healthStore — keeps "record vs reject" a single, coherent choice.
        if (
          this.validityStore === null &&
          validityVerdict !== null &&
          !validityVerdict.valid
        ) {
          quads.push(...emitValidityViolation(member, validityVerdict));
        }
      }
    }

    return quads;
  }

  private async probeGroups(
    groups: ProbeGroup[],
    onProgress?: ProbeProgressListener,
    timing?: ProbeTiming,
  ): Promise<
    Array<{
      verdict: ProbeVerdict;
      record: DistributionHealthRecord | null;
      validityVerdict: ValidityVerdict | null;
    }>
  > {
    // Probe the representatives that have a parsable URL via probeMany, which bounds total
    // fan-out (probeConcurrency) and the per-host burst (probePerHostConcurrency). A
    // representative without a Distribution never reaches the network and is evaluated
    // synthetically. Opt into shallow RDF body validation — @lde/distribution-probe makes it
    // opt-in (reachability is settled from the response alone by default) — so an empty or
    // unparseable data-dump body yields a failureReason that feeds the validity rail and the
    // registration-path sh:Violation.
    const probeable = groups
      .map((group, index) => ({
        index,
        distribution: group.representative.distribution,
      }))
      .filter(
        (entry): entry is { index: number; distribution: Distribution } =>
          entry.distribution !== null,
      );
    if (timing) timing.endpointsProbed = probeable.length;
    // Announce the total up front — probeMany only reports after each probe settles — so a caller
    // can render a determinate indicator from 0 before the first endpoint responds.
    onProgress?.(0, probeable.length);
    const networkStart = performance.now();
    const results = await probeMany(
      probeable.map((entry) => entry.distribution),
      {
        timeoutMs: this.timeoutMs,
        validateRdfContent: true,
        concurrency: this.probeConcurrency,
        perHostConcurrency: this.probePerHostConcurrency,
        onProgress,
      },
    );
    if (timing) timing.networkMs = Math.round(performance.now() - networkStart);
    const resultByGroup: (ProbeResultType | null)[] = new Array(
      groups.length,
    ).fill(null);
    probeable.forEach((entry, position) => {
      resultByGroup[entry.index] = results[position];
    });

    // Evaluate each probe into a verdict (and health/validity records). probeMany bounds the
    // network fan-out; this bounds the post-probe store writes — our own stores, so a plain
    // global cap (probeConcurrency), not the per-host budget — keeping concurrent writes at the
    // same ceiling the combined worker pool enforced before.
    const storeWriteStart = performance.now();
    const evaluated = await mapLimited(
      groups,
      this.probeConcurrency,
      (group, index) =>
        this.evaluateProbe(group.representative, resultByGroup[index]),
    );
    if (timing) {
      timing.storeWriteMs = Math.round(performance.now() - storeWriteStart);
    }
    return evaluated;
  }

  private async evaluateProbe(
    candidate: DistributionCandidate,
    result: ProbeResultType | null,
  ): Promise<{
    verdict: ProbeVerdict;
    record: DistributionHealthRecord | null;
    validityVerdict: ValidityVerdict | null;
  }> {
    const { distribution } = candidate;
    if (distribution === null || result === null) {
      return {
        verdict: {
          success: false,
          outcome: probeOutcomes.NetworkError,
          detail: `Distribution access URL is not a valid URL: ${candidate.urlNode.value}`,
        },
        record: null,
        validityVerdict: null,
      };
    }

    // A failure while recording the verdict (e.g. a health-store outage) must not reject
    // the whole batch: isolate it per candidate and surface it as a NetworkError, matching
    // the per-task error handling the worker pool previously provided.
    try {
      const verdict = classify(result);

      // The source-change fingerprint is the shared key across both rails: it is
      // recorded on the reachability health record and on the validity
      // measurement, so the staleness gate can match them by value.
      const fingerprint = sourceFingerprint(distribution, result);
      const validityVerdict = probeResultToVerdict(result, fingerprint);

      const probeUrl = canonicalProbeUrl(distribution.accessUrl);

      // The reachability rail is authoritative and updated first; the validity
      // rail is best-effort enrichment recorded afterwards. recordValidity
      // isolates its own failures so a validity-store outage can never reject the
      // probe and corrupt the reachability verdict.
      const healthStore = this.healthStore;
      const record =
        healthStore === null
          ? null
          : await this.updateHealth(
              healthStore,
              probeUrl,
              verdict,
              fingerprint,
            );
      await this.recordValidity(
        probeUrl,
        validityVerdict,
        result instanceof DataDumpProbeResult,
      );

      return {
        verdict:
          record === null ? verdict : this.applyPromotion(verdict, record),
        record,
        validityVerdict,
      };
    } catch (reason) {
      return {
        verdict: {
          success: false,
          outcome: probeOutcomes.NetworkError,
          detail: String(reason),
        },
        record: null,
        validityVerdict: null,
      };
    }
  }

  /**
   * Persist a shallow validity verdict as a DQV/PROV measurement (both valid and
   * invalid, per distribution attempted). No-op when no validity store is
   * configured (the registration API path, which instead emits a sh:Violation).
   * When the probe carried no validity signal (probeResultToVerdict returned
   * null) the measurement is cleared for a data dump — so a verdict that
   * disappears (e.g. a dump that grew past the parse limit or changed content
   * type) does not leave a stale measurement behind — and skipped for anything
   * else (a SPARQL endpoint or network failure never has a measurement).
   * Best-effort: a store failure is logged, never thrown, so the reachability
   * rail is unaffected.
   */
  private async recordValidity(
    probeUrl: URL,
    validityVerdict: ValidityVerdict | null,
    isDataDump: boolean,
  ): Promise<void> {
    const store = this.validityStore;
    if (store === null) return;
    try {
      if (validityVerdict === null) {
        if (isDataDump) await store.delete(probeUrl);
        return;
      }
      const quads = distributionValidityQuads(validityVerdict, {
        distributionUrl: probeUrl.toString(),
        generatedAt: new Date(),
        producer: this.producerAgent,
      });
      await store.store(probeUrl, quads);
    } catch (error) {
      this.logger?.warn(
        `Failed to record distribution validity for ${probeUrl.toString()}: ${String(error)}`,
      );
    }
  }

  private async updateHealth(
    store: DistributionHealthStore,
    probeUrl: URL,
    verdict: ProbeVerdict,
    fingerprint: string | null,
  ): Promise<DistributionHealthRecord> {
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
        sourceFingerprint: fingerprint,
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
      sourceFingerprint: fingerprint,
    };
    await store.store(record);
    return record;
  }

  private applyPromotion(
    verdict: ProbeVerdict,
    record: DistributionHealthRecord,
  ): ProbeVerdict {
    if (verdict.success) return verdict;

    // Deterministic content defects (empty body, unparseable graph, wrong or
    // missing Content-Type) cannot change by waiting, so surface them within one
    // probe cycle. Only transient reachability failures ride out the grace window.
    // A failure verdict always carries an outcome (classify never returns null on
    // failure), so the assertion is safe.
    if (isDeterministicFailure(verdict.outcome!.value)) return verdict;

    const streakAgeMs =
      record.firstFailureAt === null
        ? 0
        : Date.now() - record.firstFailureAt.getTime();

    const persistent = streakAgeMs >= this.failureStreakMaxAgeMs;

    return persistent ? verdict : { ...verdict, success: true };
  }
}

const probeReachableMarker = ndeProbe('probeReachable');
const probeFormatMatchMarker = ndeProbe('probeFormatMatch');

/**
 * Read the sh:severity declared for the reachability and format-match probe checks from the
 * SHACL shapes graph. A property shape opts a check in by carrying nde-probe:probeReachable or
 * nde-probe:probeFormatMatch; the shape's sh:severity is the severity the probe emits for that
 * check. Falls back to sh:Violation — SHACL's own default when a shape omits sh:severity — when
 * the marker is absent or the marked shapes disagree, so a misconfigured graph fails closed.
 */
export function readProbeSeverities(shaclGraph: DatasetCore): ProbeSeverities {
  return {
    reachable: severityForMarker(shaclGraph, probeReachableMarker),
    formatMatch: severityForMarker(shaclGraph, probeFormatMatchMarker),
    // Not shape-governed: a 429 reflects the Register being rate-limited while probing, not a
    // publisher data-quality requirement, so it is fixed at sh:Warning rather than read from the
    // shapes (severityForMarker would otherwise fail closed to sh:Violation absent a marker).
    rateLimited: shacl('Warning'),
  };
}

function severityForMarker(
  shaclGraph: DatasetCore,
  marker: NamedNode,
): NamedNode {
  const declared = new Set<string>();
  for (const quad of shaclGraph) {
    if (!quad.predicate.equals(marker)) continue;
    for (const severityQuad of shaclGraph) {
      if (
        severityQuad.subject.equals(quad.subject) &&
        severityQuad.predicate.equals(shacl('severity')) &&
        severityQuad.object.termType === 'NamedNode'
      ) {
        declared.add(severityQuad.object.value);
      }
    }
  }
  return declared.size === 1
    ? factory.namedNode([...declared][0]!)
    : shacl('Violation');
}

/**
 * Map items to results in input order, running at most `limit` tasks at once. Bounds the
 * post-probe store writes: probeMany already caps the network fan-out, so this only needs a
 * plain global cap, not the per-host budget. `task` must not reject — evaluateProbe isolates
 * its own failures into a verdict — so unlike a worker pool there is no per-task error handling.
 */
async function mapLimited<TItem, TResult>(
  items: readonly TItem[],
  limit: number,
  task: (item: TItem, index: number) => Promise<TResult>,
): Promise<TResult[]> {
  const results: TResult[] = new Array(items.length);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await task(items[index]!, index);
    }
  };
  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

interface ProbeGroup {
  /** The candidate actually probed; its verdict is reused for every member. */
  representative: DistributionCandidate;
  members: DistributionCandidate[];
}

/**
 * Coalesce candidates that resolve to an identical probe so the endpoint is hit once.
 * Candidates keep their own focus node and path, so every member still receives its own
 * sh:ValidationResult — only the network request and verdict are shared.
 */
function groupByProbeTarget(candidates: DistributionCandidate[]): ProbeGroup[] {
  const groups = new Map<string, ProbeGroup>();
  for (const candidate of candidates) {
    const key = probeKey(candidate);
    const existing = groups.get(key);
    if (existing === undefined) {
      groups.set(key, { representative: candidate, members: [candidate] });
    } else {
      existing.members.push(candidate);
    }
  }
  return [...groups.values()];
}

/**
 * Identity of the probe a candidate triggers, derived from the same Distribution that is
 * probed so the key can never disagree with the actual request. A SPARQL endpoint issues
 * an identical request regardless of how it is declared, so it is keyed by URL alone; a
 * data dump negotiates on its media type, so that is part of the key. Fields are joined
 * with a newline, which cannot appear in a URL or media type, so they cannot run together
 * into a colliding key.
 */
function probeKey(candidate: DistributionCandidate): string {
  const { distribution } = candidate;
  if (distribution === null) return `invalid\n${candidate.urlNode.value}`;
  const url = canonicalProbeUrl(distribution.accessUrl).toString();
  return distribution.isSparql()
    ? `sparql\n${url}`
    : `dump\n${url}\n${distribution.mimeType ?? ''}`;
}

/**
 * The URL fetch() actually requests: the fragment is dropped because it is never sent, so
 * distributions that differ only by a #query fragment share one probe and one health record.
 */
function canonicalProbeUrl(accessUrl: URL): URL {
  const canonical = new URL(accessUrl.toString());
  canonical.hash = '';
  return canonical;
}

/**
 * Collect every distribution URL worth probing.
 *
 * Performance: every lookup goes through `input.match(subject, predicate, null)` rather
 * than iterating the whole graph. The datasets we receive are `@rdfjs/dataset` instances,
 * which maintain a subject/predicate/object index, so each `match()` is O(matches) and the
 * whole pass is O(graph size). A previous version hand-rolled `for (const quad of input)`
 * scans inside the per-distribution helpers, which is O(distributions × graph size) —
 * quadratic — and stalled a crawl pass for ~16 minutes on a 13,789-distribution catalogue.
 *
 * Two tests guard this and MUST keep passing: "collects distributions through the index
 * without scanning the whole dataset" fails if a lookup reverts to iterating the dataset,
 * and "collects a large catalogue in roughly linear time" fails if `match()` ever loses its
 * index. Do not replace these `match()` calls with manual iteration over `input`.
 */
export function collectDistributions(
  input: DatasetCore,
): DistributionCandidate[] {
  const candidates: DistributionCandidate[] = [];
  for (const profile of ['dcat', 'schema'] as const) {
    const distributionPath =
      profile === 'dcat' ? dcat('distribution') : schema('distribution');
    for (const quad of input.match(null, distributionPath, null)) {
      const distributionNode = quad.object;
      if (
        distributionNode.termType !== 'NamedNode' &&
        distributionNode.termType !== 'BlankNode'
      ) {
        continue;
      }
      candidates.push(...candidatesFor(input, distributionNode, profile));
    }
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
  // The compression format the register split off the declared media type on
  // ingest (e.g. `application/n-quads+gzip` becomes media type
  // `application/n-quads` plus this gzip compress format). The probe needs it so
  // the content-type check accepts a server that serves the compressed form.
  const compressFormat = literalValue(
    input,
    distributionNode,
    dcat('compressFormat'),
  );
  const conformsTo =
    iriValue(input, distributionNode, dct('conformsTo')) ??
    iriValue(input, distributionNode, schema('usageInfo'));
  // The register's declared change signals, fed into the source fingerprint so a
  // verdict can be matched against the currently-observed source even before the
  // probe's HTTP Last-Modified / Content-Length are known.
  const modified =
    literalValue(input, distributionNode, dct('modified')) ??
    literalValue(input, distributionNode, schema('dateModified'));
  const byteSize =
    literalValue(input, distributionNode, dcat('byteSize')) ??
    literalValue(input, distributionNode, schema('contentSize'));

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
        distribution: toDistribution(
          urlTerm.value,
          mediaType,
          conformsTo,
          compressFormat,
          modified,
          byteSize,
        ),
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
  for (const quad of input.match(subject, predicate, null)) {
    if (quad.object.termType === 'NamedNode') {
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
  for (const quad of input.match(subject, predicate, null)) {
    if (
      quad.object.termType === 'Literal' ||
      quad.object.termType === 'NamedNode'
    ) {
      return quad.object.value;
    }
  }
  return undefined;
}

/**
 * Build the Distribution we probe. When no dct:conformsTo is declared, a SPARQL-flavoured
 * media type is mapped to the SPARQL protocol so Distribution.isSparql() recognizes the
 * endpoint — the legacy signal we still honor; modern descriptions declare conformsTo
 * directly. Returns null when the access URL is not a parsable URL, so the caller surfaces
 * a reachability violation instead of throwing.
 */
function toDistribution(
  accessUrl: string,
  mediaType: string | undefined,
  conformsTo: URL | undefined,
  compressFormat: string | undefined,
  modified: string | undefined,
  byteSize: string | undefined,
): Distribution | null {
  let url: URL;
  try {
    url = new URL(accessUrl);
  } catch {
    return null;
  }
  const resolvedConformsTo =
    conformsTo ??
    (mediaType !== undefined && /sparql/i.test(mediaType)
      ? new URL(SPARQL_PROTOCOL_URL)
      : undefined);
  const distribution = new Distribution(url, mediaType, resolvedConformsTo);
  if (compressFormat !== undefined) {
    distribution.compressFormat = compressFormat;
  }
  // A malformed declared value must not become a fingerprint component.
  // sourceFingerprint already drops an Invalid Date, so lastModified is passed
  // through as-is; but its NaN guard only covers the probe's Content-Length, not
  // the declared byteSize fallback, so a non-numeric dcat:byteSize would yield a
  // "<date>|NaN" fingerprint. Guard it here: a non-finite size is left unset.
  if (modified !== undefined) {
    distribution.lastModified = new Date(modified);
  }
  if (byteSize !== undefined) {
    const parsedByteSize = Number(byteSize);
    if (Number.isFinite(parsedByteSize)) {
      distribution.byteSize = parsedByteSize;
    }
  }
  return distribution;
}

/**
 * The probe check a verdict belongs to. A rate-limited outcome (HTTP 429) is its own check so it
 * can stay a non-blocking Warning; a content-type outcome is a format-match failure; every other
 * outcome (unreachable, server error, SPARQL/parse failure) is a reachability failure. The verdict
 * outcome decides this, not the result path, because the path always carries the
 * access/download/content URL — never the media-type property.
 */
function checkKind(verdict: ProbeVerdict): keyof ProbeSeverities {
  const outcome = verdict.outcome;
  if (outcome !== null && outcome.equals(probeOutcomes.RateLimited)) {
    return 'rateLimited';
  }
  if (
    outcome !== null &&
    (outcome.equals(probeOutcomes.ContentTypeMismatch) ||
      outcome.equals(probeOutcomes.ContentTypeMissing))
  ) {
    return 'formatMatch';
  }
  return 'reachable';
}

function emitProbeResult(
  candidate: DistributionCandidate,
  verdict: ProbeVerdict,
  record: DistributionHealthRecord | null,
  severities: ProbeSeverities,
): Quad[] {
  const resultNode = factory.blankNode();
  const outcome = verdict.outcome ?? probeOutcomes.NetworkError;
  const kind = checkKind(verdict);
  const constraintComponent =
    kind === 'formatMatch'
      ? ndeProbe('DistributionFormatMatchConstraintComponent')
      : ndeProbe('DistributionReachableConstraintComponent');

  const quads: Quad[] = [
    factory.quad(resultNode, rdf('type'), shacl('ValidationResult')),
    factory.quad(resultNode, shacl('focusNode'), candidate.distributionNode),
    factory.quad(resultNode, shacl('resultPath'), candidate.path),
    factory.quad(resultNode, shacl('value'), candidate.urlNode),
    factory.quad(resultNode, shacl('resultSeverity'), severities[kind]),
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
        factory.literal(
          verdict.detail + sparqlWebPageRemedy(candidate, verdict),
          'en',
        ),
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

// The SHACL constraint component reported for an invalid-RDF validity violation.
// It sits alongside the reachability and format-match markers under nde-probe so
// the register's SHACL validation report keeps a single vocabulary, even though
// the validity verdict itself is recorded under the metric:/failure: validity
// vocabulary on the crawler rail (the two are separate concerns: how the register
// validates, versus what it records).
const distributionValidConstraintComponent = ndeProbe(
  'DistributionValidConstraintComponent',
);

/**
 * A sh:Violation describing an invalid-RDF shallow validity verdict. Emitted only
 * on the registration path (no health/validity store configured) so a distribution
 * whose body does not parse invalidates the dataset, with the reason and – where
 * the parser provided one – the parser message. The crawler path records the same
 * verdict as a DQV quality measurement instead of emitting this.
 */
function emitValidityViolation(
  candidate: DistributionCandidate,
  verdict: ValidityVerdict,
): Quad[] {
  const resultNode = factory.blankNode();
  return [
    factory.quad(resultNode, rdf('type'), shacl('ValidationResult')),
    factory.quad(resultNode, shacl('focusNode'), candidate.distributionNode),
    factory.quad(resultNode, shacl('resultPath'), candidate.path),
    factory.quad(resultNode, shacl('value'), candidate.urlNode),
    factory.quad(resultNode, shacl('resultSeverity'), shacl('Violation')),
    factory.quad(
      resultNode,
      shacl('sourceConstraintComponent'),
      distributionValidConstraintComponent,
    ),
    factory.quad(
      resultNode,
      shacl('resultMessage'),
      factory.literal(validityViolationMessage(verdict), 'en'),
    ),
  ];
}

function validityViolationMessage(verdict: ValidityVerdict): string {
  const base =
    verdict.reason === 'empty'
      ? 'This distribution is empty: it contains no RDF triples.'
      : 'This distribution could not be parsed as RDF.';
  return verdict.message !== undefined ? `${base} ${verdict.message}` : base;
}

/**
 * A profile-specific remedy appended to the sh:resultMessage when a SPARQL endpoint answered
 * with an HTML page – the tell-tale sign that the access URL points at a SPARQL query web UI
 * rather than the protocol endpoint. The remedy names the right property because the machine
 * endpoint and its human-facing page live under different vocabularies: schema:contentUrl +
 * schema:documentation for a Schema.org description, dcat:accessURL + foaf:page for a DCAT one.
 * Returns an empty string for every other failure, so the diagnostic stands on its own.
 */
function sparqlWebPageRemedy(
  candidate: DistributionCandidate,
  verdict: ProbeVerdict,
): string {
  if (verdict.sparqlWebPage !== true) return '';
  return candidate.path.equals(schema('contentUrl'))
    ? ' Put the SPARQL protocol endpoint in schema:contentUrl and move the query UI to schema:documentation.'
    : ' Put the SPARQL protocol endpoint in dcat:accessURL and move the query UI to foaf:page.';
}
