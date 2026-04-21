import { n3FormatFor, type ContentType } from './detect-content-type.js';

export interface DataValue {
  value: string;
  language?: string;
  datatype?: string;
  isIri: boolean;
}

/**
 * Look up the values of a predicate on a focus node in the user‑pasted source.
 *
 * Used to surface the data when a SHACL constraint (uniqueLang, maxCount,
 * etc.) reports no `sh:value`. Best‑effort: supports JSON‑LD via a simple
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
    return lookupJsonLd(sourceText, focusNode, pathIri);
  }

  if (
    contentType === 'text/turtle' ||
    contentType === 'application/n-triples' ||
    contentType === 'application/n-quads' ||
    contentType === 'application/trig' ||
    contentType === 'text/n3'
  ) {
    return lookupTurtleFamily(sourceText, contentType, focusNode, pathIri);
  }

  return [];
}

function lookupJsonLd(
  sourceText: string,
  focusNode: string,
  pathIri: string,
): DataValue[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(sourceText);
  } catch {
    return [];
  }
  const results: DataValue[] = [];
  visitJsonLd(parsed, null, focusNode, pathIri, results);
  return results;
}

function visitJsonLd(
  node: unknown,
  currentContext: unknown,
  focusNode: string,
  pathIri: string,
  out: DataValue[],
): void {
  if (Array.isArray(node)) {
    for (const item of node) {
      visitJsonLd(item, currentContext, focusNode, pathIri, out);
    }
    return;
  }
  if (!node || typeof node !== 'object') return;

  const obj = node as Record<string, unknown>;
  const nextContext = obj['@context'] ?? currentContext;

  if (obj['@graph']) {
    visitJsonLd(obj['@graph'], nextContext, focusNode, pathIri, out);
  }

  if (obj['@id'] === focusNode) {
    for (const [key, value] of Object.entries(obj)) {
      if (key.startsWith('@')) continue;
      if (expandKey(key, nextContext) === pathIri) {
        for (const entry of asArray(value)) {
          const extracted = extractValue(entry);
          if (extracted) out.push(extracted);
        }
      }
    }
  }

  // Recurse so that nested objects with their own @id still reach the focus.
  for (const [key, value] of Object.entries(obj)) {
    if (key === '@context' || key === '@id' || key === '@type') continue;
    visitJsonLd(value, nextContext, focusNode, pathIri, out);
  }
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
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
    const value = String(record['@value']);
    return {
      value,
      language:
        typeof record['@language'] === 'string'
          ? (record['@language'] as string)
          : undefined,
      datatype:
        typeof record['@type'] === 'string'
          ? (record['@type'] as string)
          : undefined,
      isIri: false,
    };
  }
  if ('@id' in record) {
    return {
      value: String(record['@id']),
      isIri: true,
    };
  }
  return null;
}

function looksLikeIri(value: string): boolean {
  return /^(https?:|urn:|mailto:|did:|tel:)/.test(value);
}

/**
 * Resolve a JSON-LD term to its IRI using the surrounding @context.
 * Handles common cases:
 *   - `"@context": "https://schema.org"` → bare terms prefix with the IRI
 *   - `"@context": { "term": "iri" }` mapping
 *   - `"term": { "@id": "iri" }` full mapping
 * Prefixed forms like `sdo:name` get expanded when a matching prefix is in
 * the context. Other cases return `null`, signalling no match.
 */
function expandKey(key: string, context: unknown): string | null {
  if (key.includes('://')) return key;
  if (typeof context === 'string') {
    return joinIri(context, key);
  }
  if (Array.isArray(context)) {
    for (const part of context) {
      const resolved = expandKey(key, part);
      if (resolved) return resolved;
    }
    return null;
  }
  if (context && typeof context === 'object') {
    const map = context as Record<string, unknown>;
    const mapping = map[key];
    if (typeof mapping === 'string') return mapping;
    if (
      mapping &&
      typeof mapping === 'object' &&
      '@id' in (mapping as Record<string, unknown>)
    ) {
      return String((mapping as Record<string, unknown>)['@id']);
    }
    // Handle CURIE form like "sdo:name" where "sdo" is a prefix.
    const colonIndex = key.indexOf(':');
    if (colonIndex > 0) {
      const prefix = key.slice(0, colonIndex);
      const local = key.slice(colonIndex + 1);
      const prefixTarget = map[prefix];
      if (typeof prefixTarget === 'string') {
        return joinIri(prefixTarget, local);
      }
    }
    const vocab = map['@vocab'];
    if (typeof vocab === 'string') return joinIri(vocab, key);
  }
  return null;
}

function joinIri(base: string, suffix: string): string {
  if (base.endsWith('/') || base.endsWith('#')) return base + suffix;
  return `${base}/${suffix}`;
}

async function lookupTurtleFamily(
  sourceText: string,
  contentType: ContentType,
  focusNode: string,
  pathIri: string,
): Promise<DataValue[]> {
  const format = n3FormatFor(contentType);
  if (!format) return [];
  try {
    const { Parser } = await import('n3');
    const parser = new Parser({ format });
    const results: DataValue[] = [];
    for (const quad of parser.parse(sourceText)) {
      if (
        quad.subject.value === focusNode &&
        quad.predicate.value === pathIri
      ) {
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
    }
    return results;
  } catch {
    return [];
  }
}
