import {
  RDF_MEDIA_TYPES,
  SERVICE_PROTOCOL_LABELS,
  SPARQL_PROTOCOLS,
} from '$lib/constants';

// A SPARQL endpoint declares the SPARQL 1.1 Protocol via dct:conformsTo. The
// dataset detail page and the Dataset Knowledge Graph selector use the same URI.
export const SPARQL_PROTOCOL = 'https://www.w3.org/TR/sparql11-protocol/';

// The fields shared by the card and detail distribution schemas that determine
// whether a distribution offers linked data. Kept structural so both the
// (limited) detail distributions and any other distribution shape can be tested.
export interface DistributionLike {
  mediaType?: string | null;
  conformsTo?: readonly string[];
}

// Whether the distribution is a SPARQL endpoint: it declares one of the SPARQL
// protocol URIs via dct:conformsTo. SPARQL endpoints open in a query editor
// (YASGUI) rather than being downloaded or linked to directly.
export function isSparqlDistribution(distribution: DistributionLike): boolean {
  return (
    distribution.conformsTo?.some((protocol) =>
      (SPARQL_PROTOCOLS as readonly string[]).includes(protocol),
    ) ?? false
  );
}

// Whether the distribution is a live access endpoint (a service/API) rather than
// a file download: it declares a known service protocol via dct:conformsTo. This
// covers SPARQL endpoints and other APIs (LDES, IIIF, OAI-PMH, REST, …). Only the
// protocols actually present in the register are recognised; data-model and
// serialization conformance (e.g. Europeana EDM, N-Triples) is intentionally
// excluded — those are downloads, not endpoints.
export function isServiceDistribution(distribution: DistributionLike): boolean {
  return (
    distribution.conformsTo?.some(
      (protocol) => protocol in SERVICE_PROTOCOL_LABELS,
    ) ?? false
  );
}

// Whether the distribution is a non-SPARQL service/API endpoint (e.g. LDES, IIIF,
// OAI-PMH, REST). These are linked to directly rather than opened in a query
// editor, which is the distinction the access dropdown draws.
export function isApiDistribution(distribution: DistributionLike): boolean {
  return (
    isServiceDistribution(distribution) && !isSparqlDistribution(distribution)
  );
}

// The short technical label for the service protocol a distribution declares
// (e.g. “SPARQL”, “IIIF”, “REST API”), shown as its badge, or undefined when the
// distribution is not a recognised service endpoint. Like media-type labels these
// are international standards, so they are not translated.
export function getProtocolLabel(
  distribution: DistributionLike,
): string | undefined {
  const protocol = distribution.conformsTo?.find(
    (candidate) => candidate in SERVICE_PROTOCOL_LABELS,
  );
  return protocol ? SERVICE_PROTOCOL_LABELS[protocol] : undefined;
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
