import {
  UNAVAILABILITY_OUTCOMES,
  isDeterministicFailure,
} from '@dataset-register/core/constants';
import {
  usability,
  type Reachability,
  type Usability,
  type ValidityVerdict,
} from '@lde/distribution-health';

export type { Usability, ValidityVerdict };

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
  // The source-change fingerprint observed on the last probe (the reachability
  // rail's half of the shared key). Matched against a validity verdict's
  // fingerprint by the staleness gate in the usability rollup.
  sourceFingerprint: string | null;
}

// The probe outcomes that, once persistent, flip a distribution to unavailable,
// sourced from the register so the vocabulary stays in one place. Covers both
// unreachable distributions and ones that serve a different format than they
// declare (ContentTypeMismatch, ContentTypeMissing): a client that asked for the
// declared format cannot use either, so both count as unavailable.
const UNAVAILABILITY_FAILURES: ReadonlySet<string> = new Set(
  UNAVAILABILITY_OUTCOMES,
);

// Mirrors the crawler's transient failure-streak suppression window so the badge
// stays consistent with the per-registration warning tier (same data, same
// threshold). Only applies to transient reachability failures; deterministic
// content defects bypass it entirely (see distributionAvailability).
export const STALENESS_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function distributionAvailability(
  health: DistributionHealth | null,
  now: Date,
  thresholdMs: number = STALENESS_THRESHOLD_MS,
): DistributionAvailability {
  if (health === null) return 'unknown';
  if (health.lastOutcome === null) return 'reachable';
  if (!UNAVAILABILITY_FAILURES.has(health.lastOutcome)) return 'reachable';

  // Deterministic content defects (empty body, unparseable graph, wrong or
  // missing Content-Type) cannot self-heal, so the badge flips at once instead
  // of riding out the grace window — matching the crawler's warning tier.
  if (isDeterministicFailure(health.lastOutcome)) return 'unavailable';

  // Transient reachability failures ride out the grace window so a brief outage
  // does not flap the badge to unavailable.
  if (health.firstFailureAt === null) return 'reachable';
  const streakAgeMs = now.getTime() - health.firstFailureAt.getTime();
  return streakAgeMs >= thresholdMs ? 'unavailable' : 'reachable';
}

// Roll the register's reachability signal up with the validity verdict(s) for a
// distribution into the single canonical usability verdict, via the shared
// reference implementation in @lde/distribution-health. Reachability dominates;
// a validity verdict applies only while its fingerprint still matches the
// observed one (the staleness gate); a deep (DKG) verdict beats a shallow
// (register) one. When the probe has never recorded the distribution there is no
// reachability signal at all, so the verdict is simply unknown.
export function usabilityFor(
  health: DistributionHealth | null,
  verdicts: readonly ValidityVerdict[],
  now: Date,
  thresholdMs: number = STALENESS_THRESHOLD_MS,
): Usability {
  if (health === null) {
    return { state: 'unknown', cause: 'no-verdict' };
  }
  const reachability: Reachability = {
    reachable:
      distributionAvailability(health, now, thresholdMs) !== 'unavailable',
    fingerprint: health.sourceFingerprint,
  };
  return usability(reachability, verdicts);
}
