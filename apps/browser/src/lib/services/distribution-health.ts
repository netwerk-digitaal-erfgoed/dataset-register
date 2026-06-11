// A distribution's current availability, derived from the register's own
// distribution health probe rather than the Dataset Knowledge Graph's
// (potentially stale) void:dataDump.
export type DistributionAvailability = 'reachable' | 'unavailable' | 'unknown';

// The subset of a probe's health record the browser needs to derive
// availability. Mirrors the register's DistributionHealthRecord: lastOutcome is
// the nde-probe outcome IRI of the most recent probe (null on success).
export interface DistributionHealth {
  lastOutcome: string | null;
  lastProbedAt: Date;
  lastSuccessAt: Date | null;
  firstFailureAt: Date | null;
  consecutiveFailures: number;
}

// Derive a distribution's availability from its health record. A missing record
// means the probe has never recorded an outcome for this URL.
const ndeProbe = (outcome: string): string =>
  `https://def.nde.nl/probe#${outcome}`;

// The reachability outcomes that, once persistent, flip a distribution to
// unavailable. Content-type outcomes (ContentTypeMismatch, ContentTypeMissing)
// are deliberately excluded: they are a separate quality concern and never
// affect availability.
const REACHABILITY_FAILURES: ReadonlySet<string> = new Set([
  ndeProbe('NetworkError'),
  ndeProbe('NotFound'),
  ndeProbe('ServerError'),
  ndeProbe('AuthRequired'),
  ndeProbe('RateLimited'),
  ndeProbe('EmptyBody'),
  ndeProbe('SparqlProbeFailed'),
  ndeProbe('RdfParseFailed'),
]);

// Mirrors the crawler's failure-streak suppression window so the badge stays
// consistent with the per-registration warning tier (same data, same threshold).
export const STALENESS_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function distributionAvailability(
  health: DistributionHealth | null,
  now: Date,
  thresholdMs: number = STALENESS_THRESHOLD_MS,
): DistributionAvailability {
  if (health === null) return 'unknown';
  if (health.lastOutcome === null) return 'reachable';
  if (!REACHABILITY_FAILURES.has(health.lastOutcome)) return 'reachable';
  if (health.firstFailureAt === null) return 'reachable';

  const streakAgeMs = now.getTime() - health.firstFailureAt.getTime();
  return streakAgeMs >= thresholdMs ? 'unavailable' : 'reachable';
}
