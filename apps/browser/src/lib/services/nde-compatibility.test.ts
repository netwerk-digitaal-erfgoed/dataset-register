import { describe, expect, it } from 'vitest';
import {
  compatibilityCriteria,
  iiifState,
  registrationState,
  schemaApNdeState,
  termsState,
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

describe('registrationState', () => {
  it('is met when the dataset is registered and valid', () => {
    expect(registrationState(null)).toEqual({ state: 'met' });
    expect(registrationState(undefined)).toEqual({ state: 'met' });
  });

  it('is failed and carries the status when the registration is gone', () => {
    expect(registrationState('gone')).toEqual({
      state: 'failed',
      reason: 'gone',
    });
  });

  it('is failed and carries the status when the registration is invalid', () => {
    expect(registrationState('invalid')).toEqual({
      state: 'failed',
      reason: 'invalid',
    });
  });
});

describe('termsState', () => {
  it('is met when the dataset has links to terms', () => {
    expect(termsState({ links: 42, distinctObjectsUri: 1000 })).toBe('met');
    // Met even with no distinct-URI count, since links alone prove term usage.
    expect(termsState({ links: 1, distinctObjectsUri: null })).toBe('met');
  });

  it('is failed when it links out to URIs but to no terms', () => {
    expect(termsState({ links: 0, distinctObjectsUri: 500 })).toBe('failed');
  });

  it('is omitted (null) when there are no outgoing URI links to assess', () => {
    expect(termsState({ links: 0, distinctObjectsUri: 0 })).toBeNull();
    expect(termsState({ links: 0, distinctObjectsUri: null })).toBeNull();
  });

  it('is omitted (null) when there is no top-level VoID', () => {
    expect(termsState(null)).toBeNull();
  });
});

describe('compatibilityCriteria', () => {
  it('exposes the declared count and computed state for IIIF', () => {
    const [, , iiif] = compatibilityCriteria({
      isAnalyzed: true,
      registration: null,
      schemaApNde: noSchemaApNde,
      terms: null,
      iiif: { declared: 4152, sampled: 10, validated: 0 },
    });
    expect(iiif.key).toBe('iiif');
    expect(iiif.state).toBe('failed');
    expect(iiif.count).toBe(4152);
  });

  it('leads with the registration criterion', () => {
    const [registration] = compatibilityCriteria({
      isAnalyzed: true,
      registration: 'gone',
      schemaApNde: noSchemaApNde,
      terms: null,
      iiif: { declared: 0, sampled: null, validated: null },
    });
    expect(registration.key).toBe('registration');
    expect(registration.state).toBe('failed');
    expect(registration.reason).toBe('gone');
  });

  it('carries the schema-ap-nde failure reason on the second criterion', () => {
    const [, schemaApNde] = compatibilityCriteria({
      isAnalyzed: true,
      registration: null,
      schemaApNde: {
        quadsValidated: 0,
        conformant: false,
        declaresProfile: true,
      },
      terms: null,
      iiif: { declared: 0, sampled: null, validated: null },
    });
    expect(schemaApNde.key).toBe('schema-ap-nde');
    expect(schemaApNde.state).toBe('failed');
    expect(schemaApNde.reason).toBe('declared-but-empty');
  });

  it('renders all three criteria regardless of state for an analyzed dataset', () => {
    expect(
      compatibilityCriteria({
        isAnalyzed: true,
        registration: null,
        schemaApNde: noSchemaApNde,
        terms: null,
        iiif: { declared: 0, sampled: null, validated: null },
      }),
    ).toHaveLength(3);
  });

  it('places the terms criterion after schema-ap-nde and before iiif when present', () => {
    const keys = compatibilityCriteria({
      isAnalyzed: true,
      registration: null,
      schemaApNde: noSchemaApNde,
      terms: { links: 42, distinctObjectsUri: 1000 },
      iiif: { declared: 0, sampled: null, validated: null },
    }).map((criterion) => criterion.key);
    expect(keys).toEqual(['registration', 'schema-ap-nde', 'terms', 'iiif']);
  });

  it('exposes the links count and met state for the terms criterion', () => {
    const terms = compatibilityCriteria({
      isAnalyzed: true,
      registration: null,
      schemaApNde: noSchemaApNde,
      terms: { links: 42, distinctObjectsUri: 1000 },
      iiif: { declared: 0, sampled: null, validated: null },
    }).find((criterion) => criterion.key === 'terms');
    expect(terms?.state).toBe('met');
    expect(terms?.count).toBe(42);
  });

  it('marks the terms criterion failed when it links out but to no terms', () => {
    const terms = compatibilityCriteria({
      isAnalyzed: true,
      registration: null,
      schemaApNde: noSchemaApNde,
      terms: { links: 0, distinctObjectsUri: 500 },
      iiif: { declared: 0, sampled: null, validated: null },
    }).find((criterion) => criterion.key === 'terms');
    expect(terms?.state).toBe('failed');
  });

  it('omits the terms criterion when it cannot be assessed', () => {
    const keys = compatibilityCriteria({
      isAnalyzed: true,
      registration: null,
      schemaApNde: noSchemaApNde,
      terms: { links: 0, distinctObjectsUri: 0 },
      iiif: { declared: 0, sampled: null, validated: null },
    }).map((criterion) => criterion.key);
    expect(keys).not.toContain('terms');
  });

  it('keeps the registration criterion when the dataset is not analyzed', () => {
    // The analysis-dependent criteria are dropped, but registration applies to
    // any dataset, so it remains and keeps the section visible.
    expect(
      compatibilityCriteria({
        isAnalyzed: false,
        registration: null,
        schemaApNde: {
          quadsValidated: 200,
          conformant: true,
          declaresProfile: true,
        },
        terms: { links: 42, distinctObjectsUri: 1000 },
        iiif: { declared: 4152, sampled: 10, validated: 8 },
      }).map((criterion) => criterion.key),
    ).toEqual(['registration']);
  });
});
