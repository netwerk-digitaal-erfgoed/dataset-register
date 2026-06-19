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

/**
 * SPARQL protocol URIs a distribution declares via dct:conformsTo. A distribution
 * that conforms to one of these is a SPARQL endpoint, opened in a query editor
 * (YASGUI) rather than downloaded or linked to directly.
 */
export const SPARQL_PROTOCOLS = [
  'https://www.w3.org/TR/sparql11-protocol/',
  'https://www.w3.org/TR/rdf-sparql-query/',
] as const;

/**
 * Service/API protocols a distribution may declare via dct:conformsTo, mapped to
 * the short technical label shown as the distribution’s badge. These mark live
 * access endpoints (SPARQL plus other APIs) rather than file downloads.
 *
 * Two deliberate constraints:
 * - Only protocol URIs actually present in the register are listed, so the set is
 *   verified against the source data rather than guessed. (SoundCloud, MediaWiki,
 *   GraphQL and dataset-specific OpenAPI URLs occur too, but read as individual
 *   media resources or per-host endpoint URLs, so they stay in Download for now.)
 * - Data-model and serialization conformance (e.g. Europeana EDM, N-Triples,
 *   ontologies) is intentionally excluded: those are downloads, not endpoints,
 *   and they cannot be told apart from a protocol by media type.
 *
 * Like the media-type labels, these names are international standards, so they
 * are not translated.
 */
export const SERVICE_PROTOCOL_LABELS: Record<string, string> = {
  // SPARQL endpoints (opened in a query editor).
  'https://www.w3.org/TR/sparql11-protocol/': 'SPARQL',
  'https://www.w3.org/TR/rdf-sparql-query/': 'SPARQL',
  // Other API/service endpoints (linked to directly).
  'https://w3id.org/ldes/specification': 'LDES',
  'https://linked.art/api/1.0/search/': 'Linked Art',
  'https://iiif.io/api/discovery/1.0/': 'IIIF',
  'http://www.openarchives.org/OAI/openarchivesprotocol.html': 'OAI-PMH',
  'https://www.openarchives.org/pmh/': 'OAI-PMH',
  'https://www.openbeelden.nl/api/': 'Open Beelden',
  'https://www.ogc.org/standards/wms/': 'WMS',
  'https://spec.openapis.org/oas/v3.2.0.html': 'REST API',
};
