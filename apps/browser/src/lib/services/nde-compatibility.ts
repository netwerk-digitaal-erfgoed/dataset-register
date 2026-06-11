// The NDE compatibility (“vinkjes”) criteria surfaced on the dataset detail page.
// This module holds the locale-independent logic — which criteria there are and
// what state each is in — so it can be unit-tested without the UI. The component
// maps each criterion to its translated heading, explanation and count.

// Version-less IIIF Presentation API namespace used as the discriminator of the
// `void:subset` that records detected IIIF Presentation manifests in the
// Dataset Knowledge Graph.
export const IIIF_PRESENTATION_API = 'http://iiif.io/api/presentation/';

// NDE’s documentation on the criteria (“vinkjes”). The NDE compatibility section
// links here from its introduction.
export const NDE_VINKJES_URL =
  'https://netwerkdigitaalerfgoed.nl/aanpak/bruikbaar/#vinkjes';

// The Network of Terms (“Termennetwerk”) browser. The request locale is appended
// as a path segment (e.g. `/en`, `/nl`) when linking from the terms criterion.
export const NETWORK_OF_TERMS_URL =
  'https://termennetwerk.netwerkdigitaalerfgoed.nl';

// DQV metric IRIs for the IIIF manifest validation measurements recorded by the
// Dataset Knowledge Graph.
export const MANIFESTS_SAMPLED_METRIC =
  'https://def.nde.nl/metric#manifests-sampled';
export const MANIFESTS_VALIDATED_METRIC =
  'https://def.nde.nl/metric#manifests-validated';

// DQV metric IRIs for the SCHEMA-AP-NDE sample-conformance measurements recorded
// by the Dataset Knowledge Graph. `quads-validated` is how many quads of the
// sampled resources were validated against the profile; the conformance boolean
// is whether that sample passed. The two are co-emitted, so both are present or
// both absent.
export const SCHEMA_AP_NDE_CONFORMANCE_METRIC =
  'https://def.nde.nl/metric#schema-ap-nde-sample-conformance';
export const QUADS_VALIDATED_METRIC =
  'https://def.nde.nl/metric#quads-validated';

// DQV metric IRIs for the persistent-URI (subject-URI resolution) measurements
// recorded by the Dataset Knowledge Graph on the dataset’s self-minted subject
// namespace. `subject-uris-sampled` is the denominator (how many subject URIs
// were sampled), `subject-uris-resolved` the numerator (how many of those
// resolved to an HTML landing page).
export const SUBJECT_URIS_SAMPLED_METRIC =
  'https://def.nde.nl/metric#subject-uris-sampled';
export const SUBJECT_URIS_RESOLVED_METRIC =
  'https://def.nde.nl/metric#subject-uris-resolved';

// Boolean DQV metric flagging the subject namespace as non-durable: emitted with
// value `false` when the namespace is on the Dataset Knowledge Graph’s disallow
// list of known non-durable vendor namespaces. Absent for an unflagged
// namespace. The register reads it to demote an otherwise-green namespace that
// resolves to a 🟠 warning. It is namespace-scoped (a verdict on the namespace as
// a durable home), orthogonal to the per-URI `subject-uris-*` resolution axis.
export const SUBJECT_NAMESPACE_DURABLE_METRIC =
  'https://def.nde.nl/metric#subject-namespace-durable';

// Namespace of the recognised persistent-identifier schemes the Knowledge Graph
// attaches to a subject namespace via `dcterms:conformsTo` (e.g.
// `https://def.nde.nl/pid-scheme#ark`). Its presence is the green/orange
// discriminator for the persistent criterion.
export const PID_SCHEME_BASE_URI = 'https://def.nde.nl/pid-scheme#';

// The registration criterion leads — every registered dataset has it, so it
// anchors the section regardless of analysis. Persistent identifiers follow, then
// linked data and terms, then iiif, matching the order in NDE communication.
export type CompatibilityCriterionKey =
  | 'registration'
  | 'persistent'
  | 'linked-data'
  | 'terms'
  | 'iiif';

// Criteria that can only be assessed from the dataset’s analysis in the Dataset
// Knowledge Graph, so they are shown only for an analyzed dataset. The
// foundational criteria (registration, linked data) are left out: they apply to
// any dataset, are always shown, and so keep the section visible even for a
// dataset that has not been analyzed.
const ANALYSIS_DEPENDENT_CRITERIA: ReadonlySet<CompatibilityCriterionKey> =
  new Set(['persistent', 'terms', 'iiif']);

// The four assessment tiers a criterion can take. Not every criterion uses all
// of them (IIIF, for instance, has no 'warning'):
// 'met'     — 🟢 good.
// 'warning' — 🟠 present but not (yet) up to the recommended standard.
// 'failed'  — 🔴 error.
// 'unmet'   — ⚪ neutral. Either pending (will still be assessed) or, for IIIF,
//             not applicable.
export type CompatibilityState = 'met' | 'warning' | 'failed' | 'unmet';

// Why a registration criterion is in the `failed` state, mirroring the dataset’s
// status in the register:
// 'gone'    — the registration URL is no longer accessible.
// 'invalid' — the description no longer conforms to the requirements.
export type RegistrationFailureReason = 'gone' | 'invalid';

// Why the linked-data criterion is in the `failed` state:
// 'no-linked-data' — the register lists no linked-data distribution, so there is
//                    nothing to assess (“biedt geen linked data”).
// 'empty'          — a distribution is declared and the dataset was analyzed,
//                    but the Knowledge Graph extracted no content (“kon geen
//                    linked data ophalen”).
export type LinkedDataFailureReason = 'no-linked-data' | 'empty';

// Why the SCHEMA-AP-NDE conformance check (still surfaced on the dataset card)
// is in the `failed` state:
// 'violations'         — the sample exercised the profile’s classes but at least
//                        one sampled resource violated a constraint.
// 'declared-but-empty' — the dataset declares conformance (a distribution’s
//                        `dct:conformsTo` points at the profile), yet the
//                        sample validated zero quads: none of its resources use
//                        the profile’s classes.
export type SchemaApNdeFailureReason = 'violations' | 'declared-but-empty';

// Why a criterion is in the `failed` state. The registration reasons ('gone',
// 'invalid') carry the dataset’s status; the linked-data reasons say why no
// linked data could be assessed.
export type CompatibilityFailureReason =
  | LinkedDataFailureReason
  | RegistrationFailureReason;

// IIIF manifest figures from the Knowledge Graph: how many manifests the dataset
// declares (void:entities), and — once the pipeline has sampled them — how many
// of the sampled manifests resolved to a valid IIIF Presentation manifest.
// `sampled`/`validated` are null when no validation measurement exists yet.
export interface IiifManifests {
  declared: number;
  sampled: number | null;
  validated: number | null;
}

// The recognised persistent-identifier schemes the Knowledge Graph detects on a
// subject namespace. A recognised scheme is not what makes a namespace persistent
// — a self-minted HTTP namespace that resolves is persistent too — but it is a
// positive signal worth surfacing (the indirection survives a domain move).
export type PidScheme = 'ark' | 'handle';

// Persistent-URI figures from the Knowledge Graph for the dataset’s most common
// self-minted subject namespace. The DKG samples subject URIs from that namespace
// and dereferences them. Persistence is judged by resolution: every sampled URI
// reaching an HTML landing page is the bar. A recognised PID scheme and its
// issuing organisation are surfaced as positive embellishments, not as a gate.
// 'uriSpace'      — the namespace that was assessed, or null when the DKG found no
//                   self-minted namespace to sample (nothing to assess yet).
// 'scheme'        — the recognised PID scheme (ARK or Handle), or null. Shown as a
//                   bonus on an otherwise-green row; it does not change the state.
// 'publisher'     — the issuing organisation, resolved from the PID registry (ARK
//                   only); null for Handle or when the lookup found none.
// 'sampled'       — how many subject URIs were sampled (the denominator), or null
//                   when no resolution measurement has been recorded yet.
// 'resolved'      — how many of the sampled URIs resolved to an HTML landing page
//                   (the numerator); null when no measurement exists.
// 'onDisallowList' — whether the namespace is on the DKG’s disallow list of known
//                   non-durable vendor namespaces: it resolves today but is not a
//                   durable home for the identifiers, so it warns rather than
//                   passing. False until the DKG emits the marker (see
//                   dataset-knowledge-graph): the orange tier is dormant until then.
export interface PersistentUris {
  uriSpace: string | null;
  scheme: PidScheme | null;
  publisher: string | null;
  sampled: number | null;
  resolved: number | null;
  onDisallowList: boolean;
}

// SCHEMA-AP-NDE sample-conformance figures from the Knowledge Graph plus whether
// the dataset declares conformance via a distribution’s `dct:conformsTo`.
// `quadsValidated`/`conformant` are null when no conformance measurement exists
// yet; they are co-emitted, so they are null together.
export interface SchemaApNdeConformance {
  quadsValidated: number | null;
  conformant: boolean | null;
  declaresProfile: boolean;
}

// The signals behind the Linked data criterion:
// 'declared'       — the register lists a linked-data distribution (a SPARQL
//                    endpoint or RDF download).
// 'hasVoidDataset' — the Knowledge Graph produced a void:Dataset (the dataset
//                    was analyzed).
// 'hasContent'     — that void:Dataset carries extracted content (triples, a
//                    class partition, or distinct subjects). A composite test:
//                    large datasets can have a full class partition yet a missing
//                    void:triples aggregate.
// 'conformant'     — whether a sampled set of resources conforms to
//                    SCHEMA-AP-NDE; null when no conformance measurement exists.
//                    Only conclusive together with 'quadsValidated' > 0: a
//                    `true` over zero validated quads is vacuous, not real
//                    conformance.
// 'quadsValidated' — how many quads the conformance sample actually validated
//                    against the profile; null when no measurement exists. Zero
//                    means nothing of the profile’s classes was sampled, so the
//                    co-emitted 'conformant' carries no evidence.
// 'triples'        — void:triples, for the “n feiten” count; null when absent.
export interface LinkedData {
  declared: boolean;
  hasVoidDataset: boolean;
  hasContent: boolean;
  conformant: boolean | null;
  quadsValidated: number | null;
  triples: number | null;
}

// Term-usage figures for a dataset. `links` is the total number of link
// statements from the dataset’s contents to terms (the sum of `void:triples`
// across the dataset’s linksets). `distinctObjectsUri` is the dataset’s count of
// distinct URI-valued objects, taken from the top-level VoID — how many outgoing
// URI links there are to match against. The whole object is null when the
// criterion cannot be assessed: there is no top-level VoID (the dataset is not
// `isAnalyzed`: non-RDF or not yet analyzed by the Dataset Knowledge Graph), or
// the linkset data could not be retrieved.
export interface TermLinks {
  links: number;
  distinctObjectsUri: number | null;
}

export interface CompatibilityCriterion {
  key: CompatibilityCriterionKey;
  state: CompatibilityState;
  count: number;
  reason?: CompatibilityFailureReason;
}

export interface CompatibilityInput {
  // Whether the dataset has been analyzed by the Dataset Knowledge Graph.
  // Analysis-dependent criteria are dropped when this is false.
  isAnalyzed: boolean;
  // The dataset’s registration status: null when registered and valid, or the
  // failure reason when the registration is gone or invalid.
  registration: RegistrationFailureReason | null;
  // Whether the dataset’s registration validated with warnings. A registered,
  // valid description with warnings is surfaced as `warning` rather than `met`.
  // Tracked at registration granularity (the registration URL may describe one
  // dataset or many), so only the state is shown, not a per-dataset count.
  // Optional: absent is treated as no warnings.
  registrationHasWarnings?: boolean;
  persistent: PersistentUris;
  linkedData: LinkedData;
  terms: TermLinks | null;
  iiif: IiifManifests;
}

// Derives the registration state. Being on the detail page means the dataset is
// registered, so the criterion is `met` unless the register flags its
// registration as gone (URL no longer accessible) or invalid (description no
// longer conforms) — both surfaced as `failed` with the status as the reason —
// or the description validated with warnings (`warning`): registered and valid,
// but not yet up to the recommended standard.
export function registrationState(
  status: RegistrationFailureReason | null | undefined,
  hasWarnings = false,
): {
  state: CompatibilityState;
  reason?: CompatibilityFailureReason;
} {
  if (status === 'gone' || status === 'invalid') {
    return { state: 'failed', reason: status };
  }
  return hasWarnings ? { state: 'warning' } : { state: 'met' };
}

// Derives the SCHEMA-AP-NDE conformance state. The measurement is authoritative
// wherever it is conclusive (`quadsValidated > 0`): a passing sample is `met`, a
// failing one is `failed`/'violations'. The `dct:conformsTo` claim only tips
// the otherwise-neutral branch where the sample validated zero quads — a dataset
// that claims the profile but uses none of its classes is a real discrepancy
// ('declared-but-empty'), not a neutral “different model”. Absent any
// measurement the criterion is neutral (`unmet`), claim or not.
//
// The input is treated defensively: a missing object or undefined fields (e.g. a
// partial payload, never the full contract) collapse to the same neutral `unmet`
// as an absent measurement rather than throwing or reading as a false negative.
export function schemaApNdeState(
  conformance: Partial<SchemaApNdeConformance> | undefined | null,
): {
  state: CompatibilityState;
  reason?: SchemaApNdeFailureReason;
} {
  const quadsValidated = conformance?.quadsValidated ?? null;
  const conformant = conformance?.conformant ?? null;
  const declaresProfile = conformance?.declaresProfile ?? false;
  if (quadsValidated === null) {
    return { state: 'unmet' };
  }
  if (quadsValidated > 0) {
    return conformant
      ? { state: 'met' }
      : { state: 'failed', reason: 'violations' };
  }
  return declaresProfile
    ? { state: 'failed', reason: 'declared-but-empty' }
    : { state: 'unmet' };
}

// Derives the Linked data state. Content is the strongest signal: a dataset the
// Knowledge Graph extracted content from provides linked data whatever the
// register lists, so conformance to SCHEMA-AP-NDE then splits good (🟢, `met`)
// from a warning (🟠, content that does not — or does not yet — conform).
// Conformance counts only when the sample actually validated quads against the
// profile (`quadsValidated` > 0); a `conformant: true` over zero validated quads
// is vacuous (no resources of the profile’s classes were sampled), so it warns
// rather than confirming the profile. With no content the criterion is judged
// from what is declared: nothing declared is a plain `failed`/'no-linked-data';
// a declared distribution awaiting analysis is neutral pending (⚪, `unmet`); a
// declared distribution that was analyzed but yielded no content is
// `failed`/'empty'.
export function linkedDataState(linkedData: LinkedData): {
  state: CompatibilityState;
  reason?: LinkedDataFailureReason;
} {
  if (linkedData.hasContent) {
    const conformanceProven =
      linkedData.conformant === true && (linkedData.quadsValidated ?? 0) > 0;
    return conformanceProven ? { state: 'met' } : { state: 'warning' };
  }
  if (!linkedData.declared) {
    return { state: 'failed', reason: 'no-linked-data' };
  }
  if (!linkedData.hasVoidDataset) {
    return { state: 'unmet' };
  }
  return { state: 'failed', reason: 'empty' };
}

export function iiifState(manifests: IiifManifests): CompatibilityState {
  if (manifests.declared <= 0) {
    return 'unmet';
  }
  if ((manifests.validated ?? 0) > 0) {
    return 'met';
  }
  if ((manifests.sampled ?? 0) > 0) {
    // Manifests were sampled but none validated: declared but broken.
    return 'failed';
  }
  // Declared but not yet sampled: no evidence of failure, so treat as provided.
  return 'met';
}

// Derives the persistent-URI state from the subject-URI resolution measurement.
// Persistence is judged by resolution, not by the identifier scheme: a self-minted
// HTTP namespace that resolves to an HTML landing page is just as persistent as an
// ARK or Handle, so it is `met` (🟢). If any sampled URI fails to resolve
// (`resolved` < `sampled`), the criterion is `failed` (🔴). A namespace that fully
// resolves but is on the DKG’s disallow list of known non-durable vendor
// namespaces is a `warning` (🟠): it works today but is not a durable home for the
// identifiers. With no measurement yet — the resolution step has not run, or the
// DKG found no self-minted namespace to sample — the criterion is neutral
// pending (⚪): a grey row signalling “this will still be checked”, unlike terms
// it keeps its place rather than being omitted.
export function persistentUrisState(
  persistent: PersistentUris,
): CompatibilityState {
  if (persistent.sampled === null || persistent.sampled <= 0) {
    return 'unmet';
  }
  const resolved = persistent.resolved ?? 0;
  if (resolved < persistent.sampled) {
    return 'failed';
  }
  return persistent.onDisallowList ? 'warning' : 'met';
}

// Derives the term-usage state, or `null` when the criterion cannot be assessed
// and so must be omitted (it has no neutral grey state). The Dataset Knowledge
// Graph emits no positive “terms analysis ran” measurement, so assessability is
// inferred from the signals it does emit: a top-level VoID with a count of
// outgoing URI links to match against. Unlike the other criteria, not using
// terms is treated as a gap (red), not a neutral choice — hence the binary
// green/red with no `unmet`.
export function termsState(terms: TermLinks | null): CompatibilityState | null {
  if (terms === null) {
    // No top-level VoID (non-RDF, not yet analyzed, or linksets unavailable):
    // cannot assess, so omit.
    return null;
  }
  if (terms.links > 0) {
    return 'met';
  }
  if ((terms.distinctObjectsUri ?? 0) > 0) {
    // Analyzed and links out to URIs, but none of them to terms: a genuine gap.
    return 'failed';
  }
  // No outgoing URI links to match against, so there is nothing to assess.
  return null;
}

// Builds the list of NDE criteria for a dataset. The registration row leads — it
// applies to any dataset, so it anchors the section; the persistent-identifier
// row follows, then linked data, then terms, then IIIF, matching the order in NDE
// communication. Registration and linked data are foundational and always shown;
// the terms row is omitted when it cannot be assessed, and the analysis-dependent
// rows (persistent, terms, IIIF) are dropped when the dataset has not been
// analyzed. The detail page shows the section whenever any criterion remains.
export function compatibilityCriteria(
  input: CompatibilityInput,
): CompatibilityCriterion[] {
  const registration = registrationState(
    input.registration,
    input.registrationHasWarnings,
  );
  const linkedData = linkedDataState(input.linkedData);
  const terms = termsState(input.terms);
  const criteria: CompatibilityCriterion[] = [
    {
      key: 'registration',
      state: registration.state,
      // Warnings are tracked at registration granularity, so the criterion
      // carries no per-dataset count — the warning state is shown on its own.
      count: 0,
      reason: registration.reason,
    },
    {
      key: 'persistent',
      state: persistentUrisState(input.persistent),
      // The persistent criterion shows the resolution figures (resolved of
      // sampled) from the prop, not a single count.
      count: input.persistent.sampled ?? 0,
    },
    {
      key: 'linked-data',
      state: linkedData.state,
      count: input.linkedData.triples ?? 0,
      reason: linkedData.reason,
    },
    ...(terms !== null
      ? [
          {
            key: 'terms' as const,
            state: terms,
            count: input.terms?.links ?? 0,
          },
        ]
      : []),
    {
      key: 'iiif',
      state: iiifState(input.iiif),
      count: input.iiif.declared,
    },
  ];
  return criteria.filter(
    (criterion) =>
      input.isAnalyzed || !ANALYSIS_DEPENDENT_CRITERIA.has(criterion.key),
  );
}
