import { describe, expect, it } from 'vitest';
import {
  distributionAvailability,
  usabilityFor,
  type DistributionHealth,
  type ValidityVerdict,
} from './distribution-health';

const now = new Date('2026-06-10T12:00:00Z');

function health(
  overrides: Partial<DistributionHealth> = {},
): DistributionHealth {
  return {
    lastOutcome: null,
    lastProbedAt: now,
    lastSuccessAt: now,
    firstFailureAt: null,
    consecutiveFailures: 0,
    sourceFingerprint: null,
    ...overrides,
  };
}

describe('distributionAvailability', () => {
  it('is unknown when there is no health record', () => {
    expect(distributionAvailability(null, now)).toBe('unknown');
  });

  it('is unavailable when a reachability failure is older than the threshold', () => {
    expect(
      distributionAvailability(
        health({
          lastOutcome: 'https://def.nde.nl/probe#NetworkError',
          lastSuccessAt: null,
          firstFailureAt: new Date('2026-05-01T12:00:00Z'), // > 7 days before now
          consecutiveFailures: 12,
        }),
        now,
      ),
    ).toBe('unavailable');
  });

  it('stays reachable for a reachability failure within the threshold window', () => {
    expect(
      distributionAvailability(
        health({
          lastOutcome: 'https://def.nde.nl/probe#ServerError',
          lastSuccessAt: null,
          firstFailureAt: new Date('2026-06-08T12:00:00Z'), // 2 days before now
          consecutiveFailures: 3,
        }),
        now,
      ),
    ).toBe('reachable');
  });

  it('is unavailable for a persistent content-type failure (wrong or missing format)', () => {
    for (const outcome of ['ContentTypeMismatch', 'ContentTypeMissing']) {
      expect(
        distributionAvailability(
          health({
            lastOutcome: `https://def.nde.nl/probe#${outcome}`,
            lastSuccessAt: null,
            firstFailureAt: new Date('2026-01-01T12:00:00Z'), // months old
            consecutiveFailures: 99,
          }),
          now,
        ),
      ).toBe('unavailable');
    }
  });

  it('is unavailable for a deterministic content-type defect within the threshold window', () => {
    // Content-Type defects cannot self-heal, so the badge flips on the first
    // probe instead of riding out the grace window. (Empty/unparseable bodies are
    // no longer reachability outcomes; they migrated to the validity rail.)
    for (const outcome of ['ContentTypeMismatch', 'ContentTypeMissing']) {
      expect(
        distributionAvailability(
          health({
            lastOutcome: `https://def.nde.nl/probe#${outcome}`,
            lastSuccessAt: null,
            firstFailureAt: new Date('2026-06-12T11:59:00Z'), // 1 minute before now
            consecutiveFailures: 1,
          }),
          now,
        ),
      ).toBe('unavailable');
    }
  });

  it('is reachable when the last probe succeeded (no outcome)', () => {
    expect(distributionAvailability(health(), now)).toBe('reachable');
  });

  it('stays reachable for a transient failure outcome with no first-failure timestamp', () => {
    expect(
      distributionAvailability(
        health({
          lastOutcome: 'https://def.nde.nl/probe#NetworkError',
          lastSuccessAt: null,
          consecutiveFailures: 1,
        }),
        now,
      ),
    ).toBe('reachable');
  });
});

describe('usabilityFor', () => {
  const FRESH = '2026-06-01T00:00:00.000Z|2048';

  const shallowVerdict = (
    overrides: Partial<ValidityVerdict> = {},
  ): ValidityVerdict => ({
    valid: true,
    validatedFingerprint: FRESH,
    depth: 'shallow',
    ...overrides,
  });

  it('is unknown when the probe has never recorded the distribution', () => {
    expect(usabilityFor(null, [], now)).toEqual({
      state: 'unknown',
      cause: 'no-verdict',
    });
  });

  it('is unusable (unreachable) when the distribution is unavailable, dominating validity', () => {
    const result = usabilityFor(
      health({
        lastOutcome: 'https://def.nde.nl/probe#NotFound',
        lastSuccessAt: null,
        firstFailureAt: new Date('2026-05-01T12:00:00Z'),
        sourceFingerprint: FRESH,
      }),
      [shallowVerdict({ valid: true })],
      now,
    );
    expect(result.state).toBe('unusable');
    expect(result.cause).toBe('unreachable');
  });

  it('is usable (flagged shallow) for a reachable distribution with a fresh valid shallow verdict', () => {
    const result = usabilityFor(
      health({ sourceFingerprint: FRESH }),
      [shallowVerdict({ valid: true })],
      now,
    );
    expect(result.state).toBe('usable');
    expect(result.shallow).toBe(true);
  });

  it('is unusable (invalid) for a reachable distribution with a fresh invalid verdict', () => {
    const result = usabilityFor(
      health({ sourceFingerprint: FRESH }),
      [shallowVerdict({ valid: false, reason: 'parse-error' })],
      now,
    );
    expect(result.state).toBe('unusable');
    expect(result.cause).toBe('invalid');
  });

  it('decays a stale verdict (fingerprint no longer matches) to unknown', () => {
    const result = usabilityFor(
      health({ sourceFingerprint: 'a-newer-fingerprint' }),
      [shallowVerdict({ valid: false, reason: 'parse-error' })],
      now,
    );
    expect(result.state).toBe('unknown');
    expect(result.cause).toBe('stale-verdict');
  });

  it('prefers a deep verdict over a shallow one', () => {
    const result = usabilityFor(
      health({ sourceFingerprint: FRESH }),
      [
        shallowVerdict({ valid: false, reason: 'parse-error' }),
        { valid: true, validatedFingerprint: FRESH, depth: 'deep' },
      ],
      now,
    );
    expect(result.state).toBe('usable');
    expect(result.shallow).toBeUndefined();
  });
});
