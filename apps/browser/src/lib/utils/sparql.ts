import { Parser, Generator, type IriTerm } from 'sparqljs';

/**
 * Cleans a SPARQL query by removing LDkit-specific constructs that are not
 * needed for external triple stores.
 *
 * Specifically removes:
 * - ldkit:Resource type triples from CONSTRUCT templates
 */
export function cleanSparqlQuery(query: string): string {
  const parser = new Parser();
  const generator = new Generator();

  const parsed = parser.parse(query);

  if (parsed.type === 'query' && parsed.queryType === 'CONSTRUCT') {
    parsed.template = (parsed.template ?? []).filter((triple) => {
      // Keep triple unless it's an rdf:type triple pointing to ldkit:Resource

      return !(
        isIriTerm(triple.predicate) &&
        isIriTerm(triple.object) &&
        triple.predicate.value ===
          'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' &&
        triple.object.value.includes('ldkit.io')
      );
    });
  }

  return generator.stringify(parsed);
}

/**
 * Type guard to check if a term is an IriTerm (NamedNode)
 */
function isIriTerm(term: unknown): term is IriTerm {
  return (
    typeof term === 'object' &&
    term !== null &&
    'termType' in term &&
    term.termType === 'NamedNode'
  );
}

export const inLiterals = (values: string[]) =>
  values.map((v) => `"${v}"`).join(', ');

const IANA_MEDIA_TYPES_PREFIX = 'https://www.iana.org/assignments/media-types/';

/**
 * SPARQL expression to normalize IANA media type URIs to bare media types.
 * Strips the IANA prefix if present, otherwise returns the value as-is.
 */
export const normalizeMediaType = (inputVar: string, outputVar: string) =>
  `BIND(IF(STRSTARTS(STR(${inputVar}), "${IANA_MEDIA_TYPES_PREFIX}"),
          STRAFTER(STR(${inputVar}), "${IANA_MEDIA_TYPES_PREFIX}"),
          STR(${inputVar})) AS ${outputVar})`;
