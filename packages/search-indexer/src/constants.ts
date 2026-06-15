/**
 * RDF media types, mirrored from the browser’s format-facet grouping. A
 * distribution serving any of these contributes the `group:rdf` facet value.
 * Kept here (not imported from the browser app, which the indexer must not
 * depend on) until promoted to a shared module.
 */
export const RDF_MEDIA_TYPES: readonly string[] = [
  'application/ld+json',
  'application/n-quads',
  'application/n-quads+gzip',
  'application/n-triples',
  'application/n-triples+gzip',
  'application/rdf+xml',
  'application/rdf+xml+gzip',
  'application/trig',
  'text/n3',
  'text/n3+gzip',
  'text/turtle',
  'text/turtle+gzip',
];

/** A distribution `dct:conformsTo` this IRI contributes the `group:sparql` facet. */
export const SPARQL_PROTOCOL_URI = 'https://www.w3.org/TR/sparql11-protocol/';

/** Prefix stripped from `dcat:mediaType` IRIs to recover the bare media type. */
export const IANA_MEDIA_TYPE_PREFIX =
  'https://www.iana.org/assignments/media-types/';
