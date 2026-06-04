import { describe, expect, it } from 'vitest';
import { compatibilityCriteria, iiifState } from './nde-compatibility';

describe('iiifState', () => {
  it('is met when at least one sampled manifest validated', () => {
    expect(iiifState({ declared: 100, sampled: 10, validated: 8 })).toBe('met');
  });

  it('is failed when manifests are declared but none of the sampled validated', () => {
    expect(iiifState({ declared: 4152, sampled: 10, validated: 0 })).toBe(
      'failed',
    );
  });

  it('is unmet when no manifests are declared', () => {
    expect(iiifState({ declared: 0, sampled: null, validated: null })).toBe(
      'unmet',
    );
  });

  it('treats declared-but-not-yet-sampled as met (no evidence of failure)', () => {
    expect(iiifState({ declared: 5, sampled: null, validated: null })).toBe(
      'met',
    );
    expect(iiifState({ declared: 5, sampled: 0, validated: 0 })).toBe('met');
  });
});

describe('compatibilityCriteria', () => {
  it('exposes the declared count and computed state for IIIF', () => {
    const [iiif] = compatibilityCriteria({
      iiif: { declared: 4152, sampled: 10, validated: 0 },
    });
    expect(iiif.key).toBe('iiif');
    expect(iiif.state).toBe('failed');
    expect(iiif.count).toBe(4152);
  });

  it('renders the IIIF criterion regardless of state, so publishers always see it', () => {
    expect(
      compatibilityCriteria({
        iiif: { declared: 0, sampled: null, validated: null },
      }),
    ).toHaveLength(1);
  });
});
