import { describe, expect, it } from 'vitest';
import {
  distributionAvailability,
  type DistributionHealth,
} from './distribution-health';

const now = new Date('2026-06-10T12:00:00Z');

describe('distributionAvailability', () => {
  it('is unknown when there is no health record', () => {
    expect(distributionAvailability(null, now)).toBe('unknown');
  });

  it('is unavailable when a reachability failure is older than the threshold', () => {
    const health: DistributionHealth = {
      lastOutcome: 'https://def.nde.nl/probe#NetworkError',
      lastProbedAt: now,
      lastSuccessAt: null,
      firstFailureAt: new Date('2026-05-01T12:00:00Z'), // > 7 days before now
      consecutiveFailures: 12,
    };
    expect(distributionAvailability(health, now)).toBe('unavailable');
  });

  it('stays reachable for a reachability failure within the threshold window', () => {
    const health: DistributionHealth = {
      lastOutcome: 'https://def.nde.nl/probe#ServerError',
      lastProbedAt: now,
      lastSuccessAt: null,
      firstFailureAt: new Date('2026-06-08T12:00:00Z'), // 2 days before now
      consecutiveFailures: 3,
    };
    expect(distributionAvailability(health, now)).toBe('reachable');
  });

  it('is unavailable exactly at the threshold boundary', () => {
    const health: DistributionHealth = {
      lastOutcome: 'https://def.nde.nl/probe#NotFound',
      lastProbedAt: now,
      lastSuccessAt: null,
      firstFailureAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      consecutiveFailures: 8,
    };
    expect(distributionAvailability(health, now)).toBe('unavailable');
  });

  it('stays reachable for content-type outcomes regardless of age', () => {
    for (const outcome of ['ContentTypeMismatch', 'ContentTypeMissing']) {
      const health: DistributionHealth = {
        lastOutcome: `https://def.nde.nl/probe#${outcome}`,
        lastProbedAt: now,
        lastSuccessAt: null,
        firstFailureAt: new Date('2026-01-01T12:00:00Z'), // months old
        consecutiveFailures: 99,
      };
      expect(distributionAvailability(health, now)).toBe('reachable');
    }
  });

  it('is reachable when the last probe succeeded (no outcome)', () => {
    const health: DistributionHealth = {
      lastOutcome: null,
      lastProbedAt: now,
      lastSuccessAt: now,
      firstFailureAt: null,
      consecutiveFailures: 0,
    };
    expect(distributionAvailability(health, now)).toBe('reachable');
  });

  it('stays reachable for a failure outcome with no first-failure timestamp', () => {
    const health: DistributionHealth = {
      lastOutcome: 'https://def.nde.nl/probe#EmptyBody',
      lastProbedAt: now,
      lastSuccessAt: null,
      firstFailureAt: null,
      consecutiveFailures: 1,
    };
    expect(distributionAvailability(health, now)).toBe('reachable');
  });
});
