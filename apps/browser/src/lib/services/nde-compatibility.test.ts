import { describe, expect, it } from 'vitest';
import {
  compatibilityCriteria,
  iiifState,
  linkedDataState,
  normalizePersistentUris,
  parsePersistentUriFailureReason,
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
  htmlLandingPages: null,
  onDisallowList: false,
  failures: [],
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
  it('is met when all sampled URIs resolve to HTML landing pages, for a recognised PID scheme', () => {
    expect(
      persistentUrisState({
        uriSpace: 'https://n2t.net/ark:/22921/',
        scheme: 'ark',
        publisher: 'Gemeentemuseum Het Hannemahuis',
        sampled: 10,
        resolved: 10,
        htmlLandingPages: 10,
        onDisallowList: false,
        failures: [],
      }),
    ).toEqual({ state: 'met' });
  });

  it('is met when all sampled URIs resolve from a self-minted HTTP namespace (no PID scheme required)', () => {
    expect(
      persistentUrisState({
        uriSpace: 'http://data.beeldengeluid.nl/id/program/',
        scheme: null,
        publisher: null,
        sampled: 10,
        resolved: 10,
        htmlLandingPages: 10,
        onDisallowList: false,
        failures: [],
      }),
    ).toEqual({ state: 'met' });
  });

  it('is met with a no-html-landing-pages advisory when the URIs resolve to RDF only', () => {
    // Every sampled URI dereferences (to RDF, not an HTML page): green, but a
    // soft advisory nudges the provider to also offer a landing page.
    expect(
      persistentUrisState({
        uriSpace: 'http://data.beeldengeluid.nl/id/program/',
        scheme: null,
        publisher: null,
        sampled: 10,
        resolved: 10,
        htmlLandingPages: 0,
        onDisallowList: false,
        failures: [],
      }),
    ).toEqual({ state: 'met', advisory: 'no-html-landing-pages' });
  });

  it('does not advise when the landing-page count is unknown (old data)', () => {
    // No html-landing-pages measurement yet: stay green without the advisory
    // rather than firing it on a missing count.
    expect(
      persistentUrisState({
        uriSpace: 'http://data.beeldengeluid.nl/id/program/',
        scheme: null,
        publisher: null,
        sampled: 10,
        resolved: 10,
        htmlLandingPages: null,
        onDisallowList: false,
        failures: [],
      }),
    ).toEqual({ state: 'met' });
  });

  it('is a warning (non-durable) when all sampled URIs resolve but the namespace is on the disallow list', () => {
    expect(
      persistentUrisState({
        uriSpace: 'https://vendor.example/cms/',
        scheme: null,
        publisher: null,
        sampled: 10,
        resolved: 10,
        htmlLandingPages: 10,
        onDisallowList: true,
        failures: [],
      }),
    ).toEqual({ state: 'warning', reason: 'non-durable' });
  });

  it('is failed/unresolved when at least one sampled URI hits a hard failure, even for a recognised scheme', () => {
    expect(
      persistentUrisState({
        uriSpace: 'https://n2t.net/ark:/53016/',
        scheme: 'ark',
        publisher: 'Stichting Erfgoedpark Batavialand',
        sampled: 10,
        resolved: 0,
        htmlLandingPages: 0,
        onDisallowList: false,
        failures: [
          { uri: 'https://n2t.net/ark:/53016/1', reason: 'http-error' },
        ],
      }),
    ).toEqual({ state: 'failed', reason: 'unresolved' });
    expect(
      persistentUrisState({
        uriSpace: 'https://n2t.net/ark:/32154/',
        scheme: 'ark',
        publisher: 'Hunebedcentrum',
        sampled: 10,
        resolved: 2,
        htmlLandingPages: 2,
        onDisallowList: false,
        failures: [
          { uri: 'https://n2t.net/ark:/32154/1', reason: 'wrong-content-type' },
        ],
      }),
    ).toEqual({ state: 'failed', reason: 'unresolved' });
  });

  it('is failed/unresolved whenever resolution fell short, regardless of per-URI reasons', () => {
    expect(
      persistentUrisState({
        uriSpace: 'https://example.org/id/',
        scheme: null,
        publisher: null,
        sampled: 10,
        resolved: 2,
        htmlLandingPages: 0,
        onDisallowList: false,
        failures: [],
      }),
    ).toEqual({ state: 'failed', reason: 'unresolved' });
  });

  it('prefers the failed state over the disallow-list warning when resolution also fails', () => {
    expect(
      persistentUrisState({
        uriSpace: 'https://vendor.example/cms/',
        scheme: null,
        publisher: null,
        sampled: 10,
        resolved: 3,
        htmlLandingPages: 0,
        onDisallowList: true,
        failures: [
          { uri: 'https://vendor.example/cms/1', reason: 'http-error' },
        ],
      }),
    ).toEqual({ state: 'failed', reason: 'unresolved' });
  });

  it('is unmet (pending) when no resolution measurement has been recorded yet', () => {
    expect(persistentUrisState(pendingPersistent)).toEqual({ state: 'unmet' });
    expect(
      persistentUrisState({
        uriSpace: 'https://example.org/id/',
        scheme: null,
        publisher: null,
        sampled: 0,
        resolved: 0,
        htmlLandingPages: null,
        onDisallowList: false,
        failures: [],
      }),
    ).toEqual({ state: 'unmet' });
  });

  it('is a warning (sampling-failed) when sampling was attempted but failed, with no ratio', () => {
    // The DKG recorded a subject-uris-sampling-failed marker: the namespace was
    // selected and sampled, but the endpoint could not be queried. An error to
    // surface (🟠), not the neutral pending (⚪) of a never-sampled namespace.
    expect(
      persistentUrisState({ ...pendingPersistent, samplingFailed: true }),
    ).toEqual({ state: 'warning', reason: 'sampling-failed' });
  });

  it('prefers a real resolution ratio over the sampling-failed marker', () => {
    // The two are mutually exclusive in DKG output, but the ratio must win
    // defensively: a measured sample is conclusive, the marker is not.
    expect(
      persistentUrisState({
        uriSpace: 'https://n2t.net/ark:/22921/',
        scheme: 'ark',
        publisher: null,
        sampled: 10,
        resolved: 10,
        htmlLandingPages: 10,
        onDisallowList: false,
        failures: [],
        samplingFailed: true,
      }),
    ).toEqual({ state: 'met' });
  });

  it('treats a missing resolved measurement as zero resolved (failed/unresolved)', () => {
    expect(
      persistentUrisState({
        uriSpace: 'https://example.org/id/',
        scheme: null,
        publisher: null,
        sampled: 10,
        resolved: null,
        htmlLandingPages: null,
        onDisallowList: false,
        failures: [],
      }),
    ).toEqual({ state: 'failed', reason: 'unresolved' });
  });
});

describe('normalizePersistentUris', () => {
  it('folds legacy no-self-reference failures into the resolved count', () => {
    // Legacy DKG data: two pages resolved to HTML but did not reference their own
    // URI, so they were excluded from `resolved` and recorded as failures. Under
    // the current rules they count as resolved, so the namespace fully resolves.
    const normalized = normalizePersistentUris({
      uriSpace: 'https://example.org/id/',
      scheme: null,
      publisher: null,
      sampled: 10,
      resolved: 8,
      htmlLandingPages: null,
      onDisallowList: false,
      failures: [
        { uri: 'https://example.org/id/1', reason: 'no-self-reference' },
        { uri: 'https://example.org/id/2', reason: 'no-self-reference' },
      ],
    });
    expect(normalized.resolved).toBe(10);
    expect(normalized.failures).toEqual([]);
    // The whole point: such a dataset is green, not red, before its next re-crawl.
    expect(persistentUrisState(normalized)).toEqual({ state: 'met' });
  });

  it('keeps hard failures while folding only the no-self-reference ones', () => {
    const normalized = normalizePersistentUris({
      uriSpace: 'https://example.org/id/',
      scheme: null,
      publisher: null,
      sampled: 10,
      resolved: 8,
      htmlLandingPages: null,
      onDisallowList: false,
      failures: [
        { uri: 'https://example.org/id/1', reason: 'no-self-reference' },
        { uri: 'https://example.org/id/2', reason: 'network-error' },
      ],
    });
    expect(normalized.resolved).toBe(9);
    expect(normalized.failures).toEqual([
      { uri: 'https://example.org/id/2', reason: 'network-error' },
    ]);
    // One real failure remains, so the row stays red and lists only that URI.
    expect(persistentUrisState(normalized)).toEqual({
      state: 'failed',
      reason: 'unresolved',
    });
  });

  it('returns re-crawled data unchanged (no no-self-reference failures)', () => {
    const persistent: PersistentUris = {
      uriSpace: 'https://example.org/id/',
      scheme: null,
      publisher: null,
      sampled: 10,
      resolved: 8,
      htmlLandingPages: 8,
      onDisallowList: false,
      failures: [{ uri: 'https://example.org/id/1', reason: 'timeout' }],
    };
    expect(normalizePersistentUris(persistent)).toBe(persistent);
  });
});

describe('parsePersistentUriFailureReason', () => {
  const FAILURE = 'https://def.nde.nl/subject-resolution-failure#';
  const OUTCOME = 'https://def.nde.nl/subject-resolution-outcome#';

  it('maps a legacy subject-resolution-failure# reason', () => {
    expect(parsePersistentUriFailureReason(`${FAILURE}http-error`)).toBe(
      'http-error',
    );
    expect(parsePersistentUriFailureReason(`${FAILURE}no-self-reference`)).toBe(
      'no-self-reference',
    );
  });

  it('maps a failure outcome from the new subject-resolution-outcome# scheme', () => {
    // The DKG now records every sampled URI as a resolution:outcome concept; the
    // definitive failures share this scheme. Reading both keeps the panel working
    // across the breaking change while the live DKG is re-crawled.
    expect(parsePersistentUriFailureReason(`${OUTCOME}http-error`)).toBe(
      'http-error',
    );
    expect(
      parsePersistentUriFailureReason(`${OUTCOME}wrong-content-type`),
    ).toBe('wrong-content-type');
  });

  it('treats a success outcome as not-a-failure', () => {
    // resolved / html-landing-page are successes in the unified scheme: they must
    // never surface as failed URIs.
    expect(parsePersistentUriFailureReason(`${OUTCOME}resolved`)).toBeNull();
    expect(
      parsePersistentUriFailureReason(`${OUTCOME}html-landing-page`),
    ).toBeNull();
  });

  it('returns null for an unknown or missing IRI', () => {
    expect(parsePersistentUriFailureReason(`${OUTCOME}made-up`)).toBeNull();
    expect(parsePersistentUriFailureReason('https://example.org/x')).toBeNull();
    expect(parsePersistentUriFailureReason(undefined)).toBeNull();
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
        htmlLandingPages: 10,
        onDisallowList: false,
        failures: [],
      },
      linkedData: noLinkedData,
      terms: null,
      iiif: { declared: 0, sampled: null, validated: null },
    });
    expect(persistent.key).toBe('persistent');
    expect(persistent.state).toBe('met');
  });

  it('carries the persistent no-html-landing-pages advisory and sample count on a green row', () => {
    const [, persistent] = compatibilityCriteria({
      isAnalyzed: true,
      registration: null,
      persistent: {
        uriSpace: 'https://example.org/id/',
        scheme: null,
        publisher: null,
        sampled: 10,
        resolved: 10,
        htmlLandingPages: 0,
        onDisallowList: false,
        failures: [],
      },
      linkedData: noLinkedData,
      terms: null,
      iiif: { declared: 0, sampled: null, validated: null },
    });
    expect(persistent.key).toBe('persistent');
    expect(persistent.state).toBe('met');
    expect(persistent.advisory).toBe('no-html-landing-pages');
    expect(persistent.count).toBe(10);
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
          htmlLandingPages: 10,
          onDisallowList: false,
          failures: [],
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
