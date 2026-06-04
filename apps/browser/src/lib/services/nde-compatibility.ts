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

// DQV metric IRIs for the IIIF manifest validation measurements recorded by the
// Dataset Knowledge Graph.
export const MANIFESTS_SAMPLED_METRIC =
  'https://def.nde.nl/metric#manifests-sampled';
export const MANIFESTS_VALIDATED_METRIC =
  'https://def.nde.nl/metric#manifests-validated';

export type CompatibilityCriterionKey = 'iiif';

// 'met'    — the dataset provides working media (validated, or declared with no
//            evidence of failure).
// 'failed' — the dataset declares media, but every sampled manifest failed to
//            load (declared but broken).
// 'unmet'  — the dataset declares no media. A legitimate, neutral state.
export type CompatibilityState = 'met' | 'failed' | 'unmet';

// IIIF manifest figures from the Knowledge Graph: how many manifests the dataset
// declares (void:entities), and — once the pipeline has sampled them — how many
// of the sampled manifests resolved to a valid IIIF Presentation manifest.
// `sampled`/`validated` are null when no validation measurement exists yet.
export interface IiifManifests {
  declared: number;
  sampled: number | null;
  validated: number | null;
}

export interface CompatibilityCriterion {
  key: CompatibilityCriterionKey;
  state: CompatibilityState;
  count: number;
}

export interface CompatibilityInput {
  iiif: IiifManifests;
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

// Builds the list of NDE criteria for a dataset. Today this is a single IIIF
// row; follow-up work (#1222, #1969) appends rows here without the component
// having to change.
export function compatibilityCriteria(
  input: CompatibilityInput,
): CompatibilityCriterion[] {
  return [
    {
      key: 'iiif',
      state: iiifState(input.iiif),
      count: input.iiif.declared,
    },
  ];
}
