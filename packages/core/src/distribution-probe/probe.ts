import factory from 'rdf-ext';
import type {
  BlankNode,
  DatasetCore,
  NamedNode,
  Quad,
  Term,
} from '@rdfjs/types';
import { Distribution } from '@lde/dataset';
import { probe as probeDistribution } from '@lde/distribution-probe';
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
 * The sh:severity at which each probe check reports a failure. Read from the SHACL shapes
 * (see {@link readProbeSeverities}) so the requirements graph is the single source of truth:
 * bumping a shape from sh:Warning to sh:Violation changes runtime behaviour — a Warning informs
 * without invalidating the dataset, a Violation invalidates it — with no code change here.
 */
export interface ProbeSeverities {
  /** Reachability failures: network error, 4xx/5xx, SPARQL or RDF-parse failures, empty body. */
  reachable: NamedNode;
  /** The server Content-Type does not match the declared media type. */
  formatMatch: NamedNode;
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
   * Maximum number of distribution probes to run in parallel. Bounded because a dataset
   * can declare thousands of distributions and an unbounded fan-out exhausts sockets,
   * trips rate limiters on the target host, and starves the event loop. Default 20.
   */
  probeConcurrency?: number;
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
    this.maxProbes = options.maxProbes ?? DEFAULT_MAX_PROBES;
    this.logger = options.logger ?? null;
    this.severities = options.severities ?? {
      reachable: shacl('Violation'),
      formatMatch: shacl('Violation'),
    };
  }

  public async run(input: DatasetCore): Promise<Quad[]> {
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
    if (skipped > 0) {
      this.logger?.warn(
        `Probing ${groups.length} of ${allGroups.length} distinct distribution endpoints; skipped ${skipped} beyond the cap of ${this.maxProbes}`,
      );
    }

    const probed = await allSettledLimited(
      groups,
      this.probeConcurrency,
      (group) => this.probeCandidate(group.representative),
    );

    const quads: Quad[] = [];
    for (let index = 0; index < probed.length; index++) {
      const settled = probed[index];
      const { members } = groups[index];
      const { verdict, record, validityVerdict } =
        settled.status === 'rejected'
          ? {
              verdict: {
                success: false,
                outcome: probeOutcomes.NetworkError,
                detail: String(settled.reason),
              } satisfies ProbeVerdict,
              record: null,
              validityVerdict: null,
            }
          : settled.value;

      for (const member of members) {
        if (!verdict.success) {
          quads.push(
            ...emitProbeResult(member, verdict, record, this.severities),
          );
        }
        // Registration path (no health store): an invalid shallow validity
        // verdict surfaces as a sh:Violation so registration rejects the
        // distribution with the parse reason. In the crawler path the verdict
        // is recorded as a DQV measurement instead (see probeCandidate).
        if (
          this.healthStore === null &&
          validityVerdict !== null &&
          !validityVerdict.valid
        ) {
          quads.push(...emitValidityViolation(member, validityVerdict));
        }
      }
    }

    return quads;
  }

  private async probeCandidate(candidate: DistributionCandidate): Promise<{
    verdict: ProbeVerdict;
    record: DistributionHealthRecord | null;
    validityVerdict: ValidityVerdict | null;
  }> {
    const { distribution } = candidate;
    if (distribution === null) {
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

    const result: ProbeResultType = await probeDistribution(distribution, {
      timeoutMs: this.timeoutMs,
    });
    const verdict = classify(result);

    // The source-change fingerprint is the shared key across both rails: it is
    // recorded on the reachability health record and on the validity
    // measurement, so the staleness gate can match them by value.
    const fingerprint = sourceFingerprint(distribution, result);
    const validityVerdict = probeResultToVerdict(result, fingerprint);

    const probeUrl = canonicalProbeUrl(distribution.accessUrl);
    await this.recordValidity(probeUrl, validityVerdict);

    if (this.healthStore === null) {
      return { verdict, record: null, validityVerdict };
    }

    const record = await this.updateHealth(probeUrl, verdict, fingerprint);
    return {
      verdict: this.applyPromotion(verdict, record),
      record,
      validityVerdict,
    };
  }

  /**
   * Persist a shallow validity verdict as a DQV/PROV measurement (both valid and
   * invalid, per distribution attempted). No-op when no validity store is
   * configured (the registration API path, which instead emits a sh:Violation)
   * or when the probe carried no validity signal (probeResultToVerdict returned
   * null: a SPARQL endpoint, a network/HTTP failure, or a body the probe did not
   * parse).
   */
  private async recordValidity(
    probeUrl: URL,
    validityVerdict: ValidityVerdict | null,
  ): Promise<void> {
    if (this.validityStore === null || validityVerdict === null) return;
    const quads = distributionValidityQuads(validityVerdict, {
      distributionUrl: probeUrl.toString(),
      generatedAt: new Date(),
      producer: this.producerAgent,
    });
    await this.validityStore.store(probeUrl, quads);
  }

  private async updateHealth(
    probeUrl: URL,
    verdict: ProbeVerdict,
    fingerprint: string | null,
  ): Promise<DistributionHealthRecord> {
    const store = this.healthStore;
    if (store === null) {
      throw new Error('healthStore is required');
    }
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
  // sourceFingerprint treats an Invalid Date or NaN as absent, so a malformed
  // declared value cannot produce an unstable fingerprint; pass them through.
  if (modified !== undefined) {
    distribution.lastModified = new Date(modified);
  }
  if (byteSize !== undefined) {
    distribution.byteSize = Number(byteSize);
  }
  return distribution;
}

/**
 * The probe check a verdict belongs to. A content-type outcome is a format-match failure;
 * every other outcome (unreachable, server error, SPARQL/parse failure) is a reachability
 * failure. The verdict outcome decides this, not the result path, because the path always
 * carries the access/download/content URL — never the media-type property.
 */
function checkKind(verdict: ProbeVerdict): keyof ProbeSeverities {
  const outcome = verdict.outcome;
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
