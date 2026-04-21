export const CONTENT_TYPES = [
  'text/turtle',
  'application/ld+json',
  'application/rdf+xml',
  'application/n-triples',
  'application/n-quads',
  'application/trig',
  'text/n3',
] as const;

export type ContentType = (typeof CONTENT_TYPES)[number];

// n3.js `format` names for the Turtle family. JSON-LD and RDF/XML are absent
// because they use different parsers (JSON.parse / DOM).
const N3_FORMATS: Partial<Record<ContentType, string>> = {
  'text/turtle': 'Turtle',
  'application/n-triples': 'N-Triples',
  'application/n-quads': 'N-Quads',
  'application/trig': 'TriG',
  'text/n3': 'N3',
};

export function n3FormatFor(contentType: ContentType): string | null {
  return N3_FORMATS[contentType] ?? null;
}

export type EditorLanguage = 'json' | 'xml' | 'turtle' | 'plain';

export function languageForContentType(
  contentType: ContentType | null,
): EditorLanguage {
  switch (contentType) {
    case 'application/ld+json':
      return 'json';
    case 'application/rdf+xml':
      return 'xml';
    case null:
      return 'plain';
    default:
      return 'turtle';
  }
}

/**
 * Guess the RDF serialization of a pasted snippet with cheap regex checks.
 *
 * Returns `null` for empty input; otherwise always picks a best-guess so the
 * editor still gets a language. Users can override via the Content-Type select.
 */
export function detectContentType(input: string): ContentType | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // JSON / JSON-LD
  if (/^[[{]/.test(trimmed)) return 'application/ld+json';

  // RDF/XML
  if (/^(<\?xml|<rdf:RDF|<RDF\b)/i.test(trimmed)) return 'application/rdf+xml';

  // Turtle family — `@prefix`/`@base` or `PREFIX`/`BASE`
  if (/(^|\n)\s*@(prefix|base)\b/i.test(input)) return 'text/turtle';
  if (/(^|\n)\s*(PREFIX|BASE)\s/i.test(input)) return 'text/turtle';

  // N-Triples / N-Quads — first non-empty line starts with IRI or blank node
  const firstLine = trimmed.split(/\r?\n/, 1)[0] ?? '';
  if (/^(<[^>\s]+>|_:[A-Za-z0-9_-]+)\s/.test(firstLine)) {
    // Four terms between leading IRI/blank and the final dot → N-Quads.
    const termCount = firstLine
      .trim()
      .replace(/\s\.\s*$/, '')
      .split(/\s+/).length;
    return termCount >= 4 ? 'application/n-quads' : 'application/n-triples';
  }

  return 'text/turtle';
}
