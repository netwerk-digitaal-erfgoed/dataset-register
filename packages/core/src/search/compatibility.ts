/**
 * The single source of truth for the NDE compatibility (“vinkjes”) booleans the
 * search index exposes as facets. Each predicate mirrors the `met` branch of the
 * corresponding browser criterion (apps/browser/.../nde-compatibility.ts) but
 * takes plain numeric/boolean inputs rather than RDF, so the search-indexer
 * projection can call it directly and the browser logic and the index cannot
 * drift. Framework-agnostic and pure: no RDF, no Typesense, no UI.
 *
 * Only the `met` (🟢) outcome matters here — the index stores one boolean per
 * criterion (true = met). The browser’s warning/failed/unmet tiers and their
 * per-URI failure reasons are display nuance and deliberately not modelled.
 */

/**
 * IIIF criterion is met when the dataset declares IIIF Presentation manifests
 * (`void:entities` > 0 on the IIIF `void:subset`) and either at least one
 * sampled manifest validated, or the manifests have not been sampled yet.
 * Declared-but-not-yet-sampled counts as met (no evidence of failure);
 * sampled-but-zero-validated is not met. Mirrors `iiifState` returning 'met'.
 */
export function isIiifMet(manifests: {
  declared: number;
  sampled: number | null;
  validated: number | null;
}): boolean {
  if (manifests.declared <= 0) {
    return false;
  }
  if ((manifests.validated ?? 0) > 0) {
    return true;
  }
  // Declared but not yet sampled: no evidence of failure, so treat as provided.
  return (manifests.sampled ?? 0) <= 0;
}

/**
 * SCHEMA-AP-NDE criterion is met when the conformance sample actually validated
 * quads against the profile (`quadsValidated` > 0) and the sample conformed.
 * A `conformant: true` over zero validated quads is vacuous, so it is not met.
 * Mirrors `schemaApNdeState` returning 'met'.
 */
export function isSchemaApNdeMet(conformance: {
  quadsValidated: number | null;
  conformant: boolean | null;
}): boolean {
  return (
    (conformance.quadsValidated ?? 0) > 0 && conformance.conformant === true
  );
}

/**
 * Linked-data criterion is met when the dataset has extracted DKG content
 * (`void:triples` present / > 0) and SCHEMA-AP-NDE conformance is proven. The
 * browser’s `linkedDataState` reaches 'met' only on the `hasContent` branch with
 * proven conformance; here `hasContent` is approximated by the presence of
 * content triples, the strongest of the browser’s composite content signals.
 * Mirrors `linkedDataState` returning 'met'.
 */
export function isLinkedDataMet(linkedData: {
  triples: number | null;
  quadsValidated: number | null;
  conformant: boolean | null;
}): boolean {
  const hasContent = (linkedData.triples ?? 0) > 0;
  return (
    hasContent &&
    isSchemaApNdeMet({
      quadsValidated: linkedData.quadsValidated,
      conformant: linkedData.conformant,
    })
  );
}

/**
 * Terms criterion is met when the dataset links to at least one terminology
 * source. Mirrors `termsState` returning 'met' (terms.links > 0); the index
 * counts terminology-source links rather than link statements.
 */
export function isTermsMet(terminologySourceCount: number): boolean {
  return terminologySourceCount > 0;
}

/**
 * Persistent-URIs criterion is met when subject URIs were sampled
 * (`sampled` > 0), every sampled URI resolved (`resolved` >= `sampled`) and the
 * subject namespace is durable (not flagged non-durable). Per-URI failure
 * reasons only affect the browser’s warning-vs-failed split, never `met`, so
 * they are ignored here. Mirrors `persistentUrisState` returning 'met'.
 */
export function isPersistentUrisMet(persistent: {
  sampled: number | null;
  resolved: number | null;
  durable: boolean;
}): boolean {
  if ((persistent.sampled ?? 0) <= 0) {
    return false;
  }
  const sampled = persistent.sampled as number;
  return (persistent.resolved ?? 0) >= sampled && persistent.durable;
}
