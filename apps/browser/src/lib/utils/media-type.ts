import { stripIanaPrefix } from './prefix';

/**
 * Human-readable labels for common MIME types.
 * Technical format names are not translated as they are international standards.
 */
const MEDIA_TYPE_LABELS: Record<string, string> = {
  // RDF formats
  'application/ld+json': 'JSON-LD',
  'application/n-triples': 'N-Triples',
  'application/n-quads': 'N-Quads',
  'application/rdf+xml': 'RDF/XML',
  'application/trig': 'TriG',
  'text/turtle': 'Turtle',
  'text/n3': 'N3',

  // Common formats
  'application/json': 'JSON',
  'text/csv': 'CSV',
  'text/xml': 'XML',
  'application/xml': 'XML',
};

/**
 * Converts a MIME type to a human-readable label.
 * Handles both raw MIME types (application/ld+json) and IANA URIs.
 * Strips +gzip suffix before matching.
 * Falls back to the stripped MIME type if no mapping is found.
 */
export function getMediaTypeLabel(mimeType: string): string {
  // First strip the IANA prefix if present
  const stripped = stripIanaPrefix(mimeType);

  // Strip +gzip suffix for matching
  const baseType = stripped.replace(/\+gzip$/, '');

  return MEDIA_TYPE_LABELS[baseType] ?? stripped;
}
