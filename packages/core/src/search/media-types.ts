/**
 * Format-facet vocabulary shared by the search indexer (which derives the
 * `format`/`format_group` facets at index time) and the dataset browser (which
 * rebuilds card distributions and SPARQL filters from those same facets). Kept
 * here, alongside the class-group table, so the indexer and the browser cannot
 * drift on the media-type list, the SPARQL protocol URI, or the group tokens.
 *
 * This module is browser-safe: it has no Node dependencies and is reachable via
 * the `@dataset-register/core/search` subpath, so the browser can import it
 * without dragging in the main barrel’s Node-only modules.
 */

/** Prefix on `dcat:mediaType` IRIs; strip it to recover the bare media type. */
export const IANA_MEDIA_TYPE_PREFIX =
  'https://www.iana.org/assignments/media-types/';

/**
 * RDF media types. A distribution serving any of these contributes the
 * `group:rdf` facet value; the browser also uses the list to detect RDF
 * downloads on the card and to expand a `group:rdf` filter selection.
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

/** A distribution `dct:conformsTo` this IRI contributes the `group:sparql` facet. */
export const SPARQL_PROTOCOL_URI = 'https://www.w3.org/TR/sparql11-protocol/';

/**
 * Prefix marking a coarse facet token (`group:rdf`, `group:sparql`,
 * `group:person`, …) as opposed to a granular media type or class IRI. Both
 * the format and class facets mix granular values with these group tokens.
 */
export const GROUP_PREFIX = 'group:';

/** Grouped format facet value covering the {@link RDF_MEDIA_TYPES}. */
export const FORMAT_GROUP_RDF = 'group:rdf';

/** Grouped format facet value for distributions conforming to {@link SPARQL_PROTOCOL_URI}. */
export const FORMAT_GROUP_SPARQL = 'group:sparql';

/**
 * Strip the IANA media-types prefix to the bare `type/subtype`; values without
 * the prefix pass through unchanged. Used by the indexer’s facet projection and
 * by the browser’s facet normalization so both produce identical bare types.
 */
export function stripIanaPrefix(mediaType: string): string {
  return mediaType.startsWith(IANA_MEDIA_TYPE_PREFIX)
    ? mediaType.slice(IANA_MEDIA_TYPE_PREFIX.length)
    : mediaType;
}
