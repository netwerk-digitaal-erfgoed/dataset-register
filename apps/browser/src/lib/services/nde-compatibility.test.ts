import { describe, expect, it } from 'vitest';
import {
  compatibilityCriteria,
  iiifState,
  linkedDataState,
  persistentUrisState,
  registrationState,
  schemaApNdeState,
  termsState,
  type LinkedData,
  type PersistentUris,
} from './nde-compatibility';

// A neutral linked-data fixture for tests that focus on another criterion: no
// distribution declared and nothing analyzed yet.
const noLinkedData: LinkedData = {
  declared: false,
  hasVoidDataset: false,
  hasContent: false,
  conformant: null,
  quadsValidated: null,
  triples: null,
};

// A pending persistent-URI fixture for tests that focus on another criterion:
// analyzed, but no subject-URI resolution measurement recorded yet.
const pendingPersistent: PersistentUris = {
  uriSpace: null,
  scheme: null,
  publisher: null,
  sampled: null,
  resolved: null,
  onDisallowList: false,
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

describe('persistentUrisState', () => {
  it('is met when all sampled URIs resolve, for a recognised PID scheme', () => {
    expect(
      persistentUrisState({
        uriSpace: 'https://n2t.net/ark:/22921/',
        scheme: 'ark',
        publisher: 'Gemeentemuseum Het Hannemahuis',
        sampled: 10,
        resolved: 10,
        onDisallowList: false,
      }),
    ).toBe('met');
  });

  it('is met when all sampled URIs resolve from a self-minted HTTP namespace (no PID scheme required)', () => {
    expect(
      persistentUrisState({
        uriSpace: 'http://data.beeldengeluid.nl/id/program/',
        scheme: null,
        publisher: null,
        sampled: 10,
        resolved: 10,
        onDisallowList: false,
      }),
    ).toBe('met');
  });

  it('is a warning when all sampled URIs resolve but the namespace is on the disallow list', () => {
    expect(
      persistentUrisState({
        uriSpace: 'https://vendor.example/cms/',
        scheme: null,
        publisher: null,
        sampled: 10,
        resolved: 10,
        onDisallowList: true,
      }),
    ).toBe('warning');
  });

  it('is failed when at least one sampled URI does not resolve, even for a recognised scheme', () => {
    expect(
      persistentUrisState({
        uriSpace: 'https://n2t.net/ark:/53016/',
        scheme: 'ark',
        publisher: 'Stichting Erfgoedpark Batavialand',
        sampled: 10,
        resolved: 0,
        onDisallowList: false,
      }),
    ).toBe('failed');
    expect(
      persistentUrisState({
        uriSpace: 'https://n2t.net/ark:/32154/',
        scheme: 'ark',
        publisher: 'Hunebedcentrum',
        sampled: 10,
        resolved: 2,
        onDisallowList: false,
      }),
    ).toBe('failed');
  });

  it('prefers the failed state over the disallow-list warning when resolution also fails', () => {
    expect(
      persistentUrisState({
        uriSpace: 'https://vendor.example/cms/',
        scheme: null,
        publisher: null,
        sampled: 10,
        resolved: 3,
        onDisallowList: true,
      }),
    ).toBe('failed');
  });

  it('is unmet (pending) when no resolution measurement has been recorded yet', () => {
    expect(persistentUrisState(pendingPersistent)).toBe('unmet');
    expect(
      persistentUrisState({
        uriSpace: 'https://example.org/id/',
        scheme: null,
        publisher: null,
        sampled: 0,
        resolved: 0,
        onDisallowList: false,
      }),
    ).toBe('unmet');
  });

  it('treats a missing resolved measurement as zero resolved (failed)', () => {
    expect(
      persistentUrisState({
        uriSpace: 'https://example.org/id/',
        scheme: null,
        publisher: null,
        sampled: 10,
        resolved: null,
        onDisallowList: false,
      }),
    ).toBe('failed');
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
        quadsValidated: 200,
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
        quadsValidated: 200,
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
        quadsValidated: null,
        triples: 1000,
      }),
    ).toEqual({ state: 'warning' });
  });

  it('is a warning when conformance is vacuous: conformant but zero quads validated', () => {
    // The Knowledge Graph co-emits `conformant: true` with `quadsValidated: 0`
    // when nothing of the profile’s classes was sampled. That `true` is vacuous,
    // not real conformance, so it must warn rather than confirm the profile.
    expect(
      linkedDataState({
        declared: true,
        hasVoidDataset: true,
        hasContent: true,
        conformant: true,
        quadsValidated: 0,
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
        quadsValidated: 200,
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
        quadsValidated: null,
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
        quadsValidated: null,
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
        quadsValidated: null,
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

  it('is warning when registered and valid but the description has warnings', () => {
    expect(registrationState(null, true)).toEqual({ state: 'warning' });
    expect(registrationState(undefined, true)).toEqual({ state: 'warning' });
  });

  it('is met when registered and valid with no warnings', () => {
    expect(registrationState(null, false)).toEqual({ state: 'met' });
  });

  it('stays failed despite warnings when the registration is gone or invalid', () => {
    expect(registrationState('gone', true)).toEqual({
      state: 'failed',
      reason: 'gone',
    });
    expect(registrationState('invalid', true)).toEqual({
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
    const iiif = compatibilityCriteria({
      isAnalyzed: true,
      registration: null,
      persistent: pendingPersistent,
      linkedData: noLinkedData,
      terms: null,
      iiif: { declared: 4152, sampled: 10, validated: 0 },
    }).find((criterion) => criterion.key === 'iiif');
    expect(iiif?.state).toBe('failed');
    expect(iiif?.count).toBe(4152);
  });

  it('leads with the registration criterion', () => {
    const [registration] = compatibilityCriteria({
      isAnalyzed: true,
      registration: 'gone',
      persistent: pendingPersistent,
      linkedData: noLinkedData,
      terms: null,
      iiif: { declared: 0, sampled: null, validated: null },
    });
    expect(registration.key).toBe('registration');
    expect(registration.state).toBe('failed');
    expect(registration.reason).toBe('gone');
  });

  it('places the persistent criterion second and exposes its state', () => {
    const [, persistent] = compatibilityCriteria({
      isAnalyzed: true,
      registration: null,
      persistent: {
        uriSpace: 'https://n2t.net/ark:/22921/',
        scheme: 'ark',
        publisher: 'Gemeentemuseum Het Hannemahuis',
        sampled: 10,
        resolved: 10,
        onDisallowList: false,
      },
      linkedData: noLinkedData,
      terms: null,
      iiif: { declared: 0, sampled: null, validated: null },
    });
    expect(persistent.key).toBe('persistent');
    expect(persistent.state).toBe('met');
  });

  it('surfaces the registration warning tier without a count', () => {
    const [registration] = compatibilityCriteria({
      isAnalyzed: true,
      registration: null,
      registrationHasWarnings: true,
      persistent: pendingPersistent,
      linkedData: noLinkedData,
      terms: null,
      iiif: { declared: 0, sampled: null, validated: null },
    });
    expect(registration.key).toBe('registration');
    expect(registration.state).toBe('warning');
    // Warnings are surfaced at registration granularity, so no per-dataset
    // count is shown — only the warning state.
    expect(registration.count).toBe(0);
  });

  it('exposes the linked-data state and fact count', () => {
    const linkedData = compatibilityCriteria({
      isAnalyzed: true,
      registration: null,
      persistent: pendingPersistent,
      linkedData: {
        declared: true,
        hasVoidDataset: true,
        hasContent: true,
        conformant: true,
        quadsValidated: 200,
        triples: 1234,
      },
      terms: null,
      iiif: { declared: 0, sampled: null, validated: null },
    }).find((criterion) => criterion.key === 'linked-data');
    expect(linkedData?.state).toBe('met');
    expect(linkedData?.count).toBe(1234);
  });

  it('carries the linked-data failure reason', () => {
    const linkedData = compatibilityCriteria({
      isAnalyzed: true,
      registration: null,
      persistent: pendingPersistent,
      linkedData: {
        declared: true,
        hasVoidDataset: true,
        hasContent: false,
        conformant: null,
        quadsValidated: null,
        triples: null,
      },
      terms: null,
      iiif: { declared: 0, sampled: null, validated: null },
    }).find((criterion) => criterion.key === 'linked-data');
    expect(linkedData?.state).toBe('failed');
    expect(linkedData?.reason).toBe('empty');
  });

  it('renders registration, persistent, linked data and iiif for an analyzed dataset', () => {
    expect(
      compatibilityCriteria({
        isAnalyzed: true,
        registration: null,
        persistent: pendingPersistent,
        linkedData: noLinkedData,
        terms: null,
        iiif: { declared: 0, sampled: null, validated: null },
      }).map((criterion) => criterion.key),
    ).toEqual(['registration', 'persistent', 'linked-data', 'iiif']);
  });

  it('orders the criteria registration, persistent, linked-data, terms, iiif when all present', () => {
    const keys = compatibilityCriteria({
      isAnalyzed: true,
      registration: null,
      persistent: pendingPersistent,
      linkedData: noLinkedData,
      terms: { links: 42, distinctObjectsUri: 1000 },
      iiif: { declared: 0, sampled: null, validated: null },
    }).map((criterion) => criterion.key);
    expect(keys).toEqual([
      'registration',
      'persistent',
      'linked-data',
      'terms',
      'iiif',
    ]);
  });

  it('exposes the links count and met state for the terms criterion', () => {
    const terms = compatibilityCriteria({
      isAnalyzed: true,
      registration: null,
      persistent: pendingPersistent,
      linkedData: noLinkedData,
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
      persistent: pendingPersistent,
      linkedData: noLinkedData,
      terms: { links: 0, distinctObjectsUri: 500 },
      iiif: { declared: 0, sampled: null, validated: null },
    }).find((criterion) => criterion.key === 'terms');
    expect(terms?.state).toBe('failed');
  });

  it('omits the terms criterion when it cannot be assessed', () => {
    const keys = compatibilityCriteria({
      isAnalyzed: true,
      registration: null,
      persistent: pendingPersistent,
      linkedData: noLinkedData,
      terms: { links: 0, distinctObjectsUri: 0 },
      iiif: { declared: 0, sampled: null, validated: null },
    }).map((criterion) => criterion.key);
    expect(keys).not.toContain('terms');
  });

  it('keeps the foundational criteria when the dataset is not analyzed', () => {
    // The analysis-dependent criteria (persistent, terms, IIIF) are dropped, but
    // registration and linked data are foundational, so they remain and keep the
    // section visible.
    expect(
      compatibilityCriteria({
        isAnalyzed: false,
        registration: null,
        persistent: {
          uriSpace: 'https://n2t.net/ark:/22921/',
          scheme: 'ark',
          publisher: 'Gemeentemuseum Het Hannemahuis',
          sampled: 10,
          resolved: 10,
        },
        linkedData: {
          declared: true,
          hasVoidDataset: false,
          hasContent: false,
          conformant: null,
          quadsValidated: null,
          triples: null,
        },
        terms: { links: 42, distinctObjectsUri: 1000 },
        iiif: { declared: 4152, sampled: 10, validated: 8 },
      }).map((criterion) => criterion.key),
    ).toEqual(['registration', 'linked-data']);
  });
});
