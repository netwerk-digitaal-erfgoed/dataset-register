/**
 * RDF media types for distribution formats.
 * Used in DatasetCard to detect RDF distributions and in facets for grouping.
 */
export const RDF_MEDIA_TYPES = [
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
] as const;
