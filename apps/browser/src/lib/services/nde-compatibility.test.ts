import { describe, expect, it } from 'vitest';
import {
  compatibilityCriteria,
  iiifState,
  linkedDataState,
  registrationState,
  schemaApNdeState,
  type LinkedData,
} from './nde-compatibility';

// A neutral linked-data fixture for tests that focus on another criterion: no
// distribution declared and nothing analyzed yet.
const noLinkedData: LinkedData = {
  declared: false,
  hasVoidDataset: false,
  hasContent: false,
  conformant: null,
  triples: null,
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

describe('linkedDataState', () => {
  it('is met when content conforms to the profile', () => {
    expect(
      linkedDataState({
        declared: true,
        hasVoidDataset: true,
        hasContent: true,
        conformant: true,
        triples: 1000,
      }),
    ).toEqual({ state: 'met' });
  });

  it('is a warning when content does not (yet) conform', () => {
    expect(
      linkedDataState({
        declared: true,
        hasVoidDataset: true,
        hasContent: true,
        conformant: false,
        triples: 1000,
      }),
    ).toEqual({ state: 'warning' });
    // No conformance measurement yet still warns: there is content, just no
    // confirmation it conforms.
    expect(
      linkedDataState({
        declared: true,
        hasVoidDataset: true,
        hasContent: true,
        conformant: null,
        triples: 1000,
      }),
    ).toEqual({ state: 'warning' });
  });

  it('lets content win even when no distribution was detected in the register', () => {
    // The detail page loads a bounded set of distributions, so `declared` can be
    // a false negative; extracted content is authoritative.
    expect(
      linkedDataState({
        declared: false,
        hasVoidDataset: true,
        hasContent: true,
        conformant: true,
        triples: 1000,
      }),
    ).toEqual({ state: 'met' });
  });

  it('is failed/no-linked-data when nothing is declared and there is no content', () => {
    expect(
      linkedDataState({
        declared: false,
        hasVoidDataset: false,
        hasContent: false,
        conformant: null,
        triples: null,
      }),
    ).toEqual({ state: 'failed', reason: 'no-linked-data' });
  });

  it('is unmet (pending) when declared but not yet analyzed', () => {
    expect(
      linkedDataState({
        declared: true,
        hasVoidDataset: false,
        hasContent: false,
        conformant: null,
        triples: null,
      }),
    ).toEqual({ state: 'unmet' });
  });

  it('is failed/empty when declared and analyzed but no content was extracted', () => {
    expect(
      linkedDataState({
        declared: true,
        hasVoidDataset: true,
        hasContent: false,
        conformant: null,
        triples: null,
      }),
    ).toEqual({ state: 'failed', reason: 'empty' });
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

describe('compatibilityCriteria', () => {
  it('exposes the declared count and computed state for IIIF', () => {
    const [, , iiif] = compatibilityCriteria({
      isAnalyzed: true,
      registration: null,
      linkedData: noLinkedData,
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
      linkedData: noLinkedData,
      iiif: { declared: 0, sampled: null, validated: null },
    });
    expect(registration.key).toBe('registration');
    expect(registration.state).toBe('failed');
    expect(registration.reason).toBe('gone');
  });

  it('exposes the linked-data state and fact count on the second criterion', () => {
    const [, linkedData] = compatibilityCriteria({
      isAnalyzed: true,
      registration: null,
      linkedData: {
        declared: true,
        hasVoidDataset: true,
        hasContent: true,
        conformant: true,
        triples: 1234,
      },
      iiif: { declared: 0, sampled: null, validated: null },
    });
    expect(linkedData.key).toBe('linked-data');
    expect(linkedData.state).toBe('met');
    expect(linkedData.count).toBe(1234);
  });

  it('carries the linked-data failure reason on the second criterion', () => {
    const [, linkedData] = compatibilityCriteria({
      isAnalyzed: true,
      registration: null,
      linkedData: {
        declared: true,
        hasVoidDataset: true,
        hasContent: false,
        conformant: null,
        triples: null,
      },
      iiif: { declared: 0, sampled: null, validated: null },
    });
    expect(linkedData.key).toBe('linked-data');
    expect(linkedData.state).toBe('failed');
    expect(linkedData.reason).toBe('empty');
  });

  it('renders all three criteria regardless of state for an analyzed dataset', () => {
    expect(
      compatibilityCriteria({
        isAnalyzed: true,
        registration: null,
        linkedData: noLinkedData,
        iiif: { declared: 0, sampled: null, validated: null },
      }),
    ).toHaveLength(3);
  });

  it('keeps the foundational criteria when the dataset is not analyzed', () => {
    // The analysis-dependent IIIF criterion is dropped, but registration and
    // linked data are foundational, so they remain and keep the section visible.
    expect(
      compatibilityCriteria({
        isAnalyzed: false,
        registration: null,
        linkedData: {
          declared: true,
          hasVoidDataset: false,
          hasContent: false,
          conformant: null,
          triples: null,
        },
        iiif: { declared: 4152, sampled: 10, validated: 8 },
      }).map((criterion) => criterion.key),
    ).toEqual(['registration', 'linked-data']);
  });
});
