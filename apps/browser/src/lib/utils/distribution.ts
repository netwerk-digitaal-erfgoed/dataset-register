import {
  RDF_MEDIA_TYPES,
  SPARQL_PROTOCOL_URI,
} from '@dataset-register/core/search';

// A SPARQL endpoint declares the SPARQL 1.1 Protocol via dct:conformsTo. The
// dataset detail page and the Dataset Knowledge Graph selector use the same URI.
export const SPARQL_PROTOCOL = SPARQL_PROTOCOL_URI;

// The fields shared by the card and detail distribution schemas that determine
// whether a distribution offers linked data. Kept structural so both the
// (limited) detail distributions and any other distribution shape can be tested.
export interface DistributionLike {
  mediaType?: string | null;
  conformsTo?: readonly string[];
}

// Whether the distribution is a SPARQL endpoint.
export function isSparqlDistribution(distribution: DistributionLike): boolean {
  return distribution.conformsTo?.includes(SPARQL_PROTOCOL) ?? false;
}

// Whether the distribution is an RDF download, by its media type. Mirrors the
// RDF grouping used by the search facet and the dataset card.
export function isRdfDistribution(distribution: DistributionLike): boolean {
  return (
    distribution.mediaType != null &&
    RDF_MEDIA_TYPES.includes(
      distribution.mediaType as (typeof RDF_MEDIA_TYPES)[number],
    )
  );
}

// Whether the dataset offers any linked-data distribution — a SPARQL endpoint or
// an RDF download. This is the “declared” signal for the Linked data
// compatibility criterion, reusing the same notion of RDF the rest of the app
// applies rather than re-deriving the Knowledge Graph’s selection query.
export function offersLinkedData(
  distributions: readonly DistributionLike[],
): boolean {
  return distributions.some(
    (distribution) =>
      isSparqlDistribution(distribution) || isRdfDistribution(distribution),
  );
}
