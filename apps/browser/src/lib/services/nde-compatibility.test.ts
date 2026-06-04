import { describe, expect, it } from 'vitest';
import {
  compatibilityCriteria,
  iiifState,
  schemaApNdeState,
  type SchemaApNdeConformance,
} from './nde-compatibility';

// A neutral conformance fixture for tests that focus on another criterion.
const noSchemaApNde: SchemaApNdeConformance = {
  quadsValidated: null,
  conformant: null,
  declaresProfile: false,
};

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

describe('schemaApNdeState', () => {
  it('is met when the validated sample conforms', () => {
    expect(
      schemaApNdeState({
        quadsValidated: 200,
        conformant: true,
        declaresProfile: false,
      }),
    ).toEqual({ state: 'met' });
  });

  it('is failed/violations when the validated sample does not conform', () => {
    expect(
      schemaApNdeState({
        quadsValidated: 200,
        conformant: false,
        declaresProfile: false,
      }),
    ).toEqual({ state: 'failed', reason: 'violations' });
  });

  it('lets the measurement win over the claim when conclusive', () => {
    // A passing measurement stays met even if the dataset also declares the
    // profile; a failing one stays failed/violations.
    expect(
      schemaApNdeState({
        quadsValidated: 200,
        conformant: true,
        declaresProfile: true,
      }),
    ).toEqual({ state: 'met' });
    expect(
      schemaApNdeState({
        quadsValidated: 200,
        conformant: false,
        declaresProfile: true,
      }),
    ).toEqual({ state: 'failed', reason: 'violations' });
  });

  it('is failed/declared-but-empty when zero quads validated yet the profile is declared', () => {
    expect(
      schemaApNdeState({
        quadsValidated: 0,
        conformant: false,
        declaresProfile: true,
      }),
    ).toEqual({ state: 'failed', reason: 'declared-but-empty' });
  });

  it('is unmet when zero quads validated and no claim (different data model)', () => {
    expect(
      schemaApNdeState({
        quadsValidated: 0,
        conformant: false,
        declaresProfile: false,
      }),
    ).toEqual({ state: 'unmet' });
  });

  it('is unmet when no measurement exists, even if the profile is declared', () => {
    expect(
      schemaApNdeState({
        quadsValidated: null,
        conformant: null,
        declaresProfile: true,
      }),
    ).toEqual({ state: 'unmet' });
  });

  it('treats a missing or partial input as a neutral unmet rather than throwing', () => {
    expect(schemaApNdeState(undefined)).toEqual({ state: 'unmet' });
    expect(schemaApNdeState({})).toEqual({ state: 'unmet' });
    expect(schemaApNdeState({ conformant: false })).toEqual({ state: 'unmet' });
  });
});

describe('compatibilityCriteria', () => {
  it('exposes the declared count and computed state for IIIF', () => {
    const [, iiif] = compatibilityCriteria({
      schemaApNde: noSchemaApNde,
      iiif: { declared: 4152, sampled: 10, validated: 0 },
    });
    expect(iiif.key).toBe('iiif');
    expect(iiif.state).toBe('failed');
    expect(iiif.count).toBe(4152);
  });

  it('leads with the schema-ap-nde criterion and carries its failure reason', () => {
    const [schemaApNde] = compatibilityCriteria({
      schemaApNde: {
        quadsValidated: 0,
        conformant: false,
        declaresProfile: true,
      },
      iiif: { declared: 0, sampled: null, validated: null },
    });
    expect(schemaApNde.key).toBe('schema-ap-nde');
    expect(schemaApNde.state).toBe('failed');
    expect(schemaApNde.reason).toBe('declared-but-empty');
  });

  it('renders both criteria regardless of state, so publishers always see them', () => {
    expect(
      compatibilityCriteria({
        schemaApNde: noSchemaApNde,
        iiif: { declared: 0, sampled: null, validated: null },
      }),
    ).toHaveLength(2);
  });
});
