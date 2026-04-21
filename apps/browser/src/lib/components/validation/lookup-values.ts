import type { ContentType } from './detect-content-type.js';
import {
  expandTerm,
  parseN3Quads,
  safeParseJson,
  walkJsonLd,
} from './rdf-helpers.js';

export interface DataValue {
  value: string;
  language?: string;
  datatype?: string;
  isIri: boolean;
}

/**
 * Look up the values of a predicate on a focus node in the user-pasted source.
 *
 * Used to surface the data when a SHACL constraint (uniqueLang, maxCount,
 * etc.) reports no `sh:value`. Best-effort: supports JSON-LD via a simple
 * tree walk and the Turtle family via the `n3` parser. Returns an empty
 * array on parse errors or unsupported inputs.
 */
export async function lookupValues(
  sourceText: string,
  contentType: ContentType,
  focusNode: string,
  pathIri: string,
): Promise<DataValue[]> {
  if (!sourceText.trim() || !focusNode || !pathIri) return [];

  if (contentType === 'application/ld+json') {
    const results: DataValue[] = [];
    walkJsonLd(safeParseJson(sourceText), (node, context) => {
      if (node['@id'] !== focusNode) return;
      for (const [key, value] of Object.entries(node)) {
        if (key.startsWith('@')) continue;
        if (expandTerm(key, context) !== pathIri) continue;
        for (const entry of Array.isArray(value) ? value : [value]) {
          const extracted = extractValue(entry);
          if (extracted) results.push(extracted);
        }
      }
    });
    return results;
  }

  const results: DataValue[] = [];
  for (const quad of await parseN3Quads(sourceText, contentType)) {
    if (quad.subject.value !== focusNode || quad.predicate.value !== pathIri) {
      continue;
    }
    const object = quad.object;
    if (object.termType === 'Literal') {
      results.push({
        value: object.value,
        language: object.language || undefined,
        datatype: object.datatype?.value,
        isIri: false,
      });
    } else {
      results.push({ value: object.value, isIri: true });
    }
  }
  return results;
}

function extractValue(entry: unknown): DataValue | null {
  if (entry === null || entry === undefined) return null;
  if (typeof entry === 'string') {
    return { value: entry, isIri: looksLikeIri(entry) };
  }
  if (typeof entry === 'number' || typeof entry === 'boolean') {
    return { value: String(entry), isIri: false };
  }
  if (typeof entry !== 'object') return null;
  const record = entry as Record<string, unknown>;
  if ('@value' in record) {
    return {
      value: String(record['@value']),
      language:
        typeof record['@language'] === 'string' ? record['@language'] : undefined,
      datatype:
        typeof record['@type'] === 'string' ? record['@type'] : undefined,
      isIri: false,
    };
  }
  if ('@id' in record) {
    return { value: String(record['@id']), isIri: true };
  }
  return null;
}

function looksLikeIri(value: string): boolean {
  return /^(https?:|urn:|mailto:|did:|tel:)/.test(value);
}
