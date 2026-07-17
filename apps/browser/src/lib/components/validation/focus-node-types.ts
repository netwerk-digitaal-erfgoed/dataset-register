import type { ContentType } from './detect-content-type.js';
import {
  expandTerm,
  parseN3Quads,
  safeParseJson,
  standardizeSchemaOrgPrefix,
  walkJsonLd,
} from './rdf-helpers.js';

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

/**
 * Build a Map<focusNode IRI, rdf:type IRI> by parsing the inline source.
 * Used to resolve shape-name ambiguity when two shapes share a path
 * (e.g. Dataset vs DataCatalog for `schema:name`). Best effort – unknown
 * formats or parse errors return an empty map.
 *
 * Types are standardized to the https://schema.org prefix: a source may publish
 * either prefix, while the shapes and the validation report only use https, and
 * every consumer here compares these types against those.
 */
export async function buildFocusNodeTypes(
  sourceText: string,
  contentType: ContentType,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (!sourceText.trim()) return result;

  if (contentType === 'application/ld+json') {
    walkJsonLd(safeParseJson(sourceText), (node, context) => {
      const id = node['@id'];
      const type = node['@type'];
      if (typeof id !== 'string' || result.has(id)) return;
      const typeStr = Array.isArray(type) ? type[0] : type;
      if (typeof typeStr !== 'string') return;
      result.set(
        id,
        standardizeSchemaOrgPrefix(expandTerm(typeStr, context) ?? typeStr),
      );
    });
    return result;
  }

  for (const quad of await parseN3Quads(sourceText, contentType)) {
    if (quad.predicate.value === RDF_TYPE && !result.has(quad.subject.value)) {
      result.set(
        quad.subject.value,
        standardizeSchemaOrgPrefix(quad.object.value),
      );
    }
  }
  return result;
}
