// The NDE compatibility (“vinkjes”) criteria surfaced on the dataset detail page.
// This module holds the locale-independent logic — which criteria there are and
// what state each is in — so it can be unit-tested without the UI. The component
// maps each criterion to its translated heading, explanation and count.

// Version-less IIIF Presentation API namespace used as the discriminator of the
// `void:subset` that records detected IIIF Presentation manifests in the
// Dataset Knowledge Graph.
export const IIIF_PRESENTATION_API = 'http://iiif.io/api/presentation/';

// NDE’s documentation on the criteria (“vinkjes”).
export const IIIF_VINKJES_URL =
  'https://netwerkdigitaalerfgoed.nl/aanpak/bruikbaar/#vinkjes';

// The NDE Schema.org Application Profile. A distribution declares compliance with
// `dct:conformsTo` pointing here (the register’s internal model is DCAT, so the
// publisher-facing schema:usageInfo is normalised to dct:conformsTo at ingest).
// Also linked from the detail page as the criterion’s documentation.
export const SCHEMA_AP_NDE_PROFILE = 'https://docs.nde.nl/schema-profile/';

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

// The schema-ap-nde criterion is ordered before iiif, matching the usual order
// in NDE communication.
export type CompatibilityCriterionKey = 'schema-ap-nde' | 'iiif';

// Criteria that can only be assessed from the dataset’s analysis in the Dataset
// Knowledge Graph, so they are shown only for an analyzed dataset. A criterion
// that applies to any dataset is left out of this set; it is always shown and so
// keeps the section visible even for a dataset that has not been analyzed.
const ANALYSIS_DEPENDENT_CRITERIA: ReadonlySet<CompatibilityCriterionKey> =
  new Set(['schema-ap-nde', 'iiif']);

// 'met'    — the dataset provides working media (validated, or declared with no
//            evidence of failure).
// 'failed' — the dataset declares media, but every sampled manifest failed to
//            load (declared but broken).
// 'unmet'  — the dataset declares no media. A legitimate, neutral state.
export type CompatibilityState = 'met' | 'failed' | 'unmet';

// Why a schema-ap-nde criterion is in the `failed` state:
// 'violations'         — the sample exercised the profile’s classes but at least
//                        one sampled resource violated a constraint.
// 'declared-but-empty' — the dataset declares conformance (a distribution’s
//                        `dct:conformsTo` points at the profile), yet the
//                        sample validated zero quads: none of its resources use
//                        the profile’s classes.
export type CompatibilityFailureReason = 'violations' | 'declared-but-empty';

// IIIF manifest figures from the Knowledge Graph: how many manifests the dataset
// declares (void:entities), and — once the pipeline has sampled them — how many
// of the sampled manifests resolved to a valid IIIF Presentation manifest.
// `sampled`/`validated` are null when no validation measurement exists yet.
export interface IiifManifests {
  declared: number;
  sampled: number | null;
  validated: number | null;
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
  schemaApNde: SchemaApNdeConformance;
  iiif: IiifManifests;
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
  reason?: CompatibilityFailureReason;
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

// Builds the list of NDE criteria for a dataset. The schema-ap-nde row leads,
// matching the usual order in NDE communication; the IIIF row follows. Criteria
// that depend on the dataset’s analysis are dropped when the dataset has not
// been analyzed; the detail page shows the section whenever any criterion
// remains.
export function compatibilityCriteria(
  input: CompatibilityInput,
): CompatibilityCriterion[] {
  const schemaApNde = schemaApNdeState(input.schemaApNde);
  const criteria: CompatibilityCriterion[] = [
    {
      key: 'schema-ap-nde',
      state: schemaApNde.state,
      count: 0,
      reason: schemaApNde.reason,
    },
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
