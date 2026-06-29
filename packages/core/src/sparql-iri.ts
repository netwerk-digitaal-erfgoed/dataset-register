/**
 * Percent-encode the characters that are illegal in a SPARQL/Turtle IRIREF
 * (`<…>`). RFC 3987 already forbids these in an IRI, but the WHATWG URL parser
 * leaves some of them – notably `{` and `}` – un-encoded in the query component.
 * A registration URL that inlines a SPARQL CONSTRUCT (e.g.
 * `…/sparql?query=CONSTRUCT { ?s ?p ?o } …`) therefore keeps literal braces and
 * breaks any SPARQL update or N-Triples document that embeds the URL as `<…>`.
 *
 * Encoding is idempotent for already-valid IRIs: `%` is itself a legal IRIREF
 * character, so an existing `%20` is left untouched while a literal space becomes
 * `%20`. Applying this consistently when writing and when querying keeps the two
 * forms identical, so a registration submitted with literal braces still matches
 * on lookup and delete.
 */
export function sparqlIri(value: URL | string): string {
  const iri = typeof value === 'string' ? value : value.toString();
  let encoded = '';
  for (const character of iri) {
    if (
      character.charCodeAt(0) <= 0x20 ||
      ILLEGAL_IRI_CHARACTERS.has(character)
    ) {
      encoded += '%'.concat(
        character.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'),
      );
    } else {
      encoded += character;
    }
  }
  return encoded;
}

/**
 * Characters that are illegal in a SPARQL/Turtle IRIREF (`<…>`) outside the
 * U+0000–U+0020 control range: angle brackets, double quote, braces, pipe,
 * caret, backtick and backslash.
 */
const ILLEGAL_IRI_CHARACTERS = new Set([
  '<',
  '>',
  '"',
  '{',
  '}',
  '|',
  '^',
  '`',
  '\\',
]);
