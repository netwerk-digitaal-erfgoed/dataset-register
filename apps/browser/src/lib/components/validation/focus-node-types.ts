import { n3FormatFor, type ContentType } from './detect-content-type.js';

/**
 * Build a Map<focusNode IRI, rdf:type IRI> by parsing the inline source.
 * Used to resolve shape-name ambiguity when two shapes share a path
 * (e.g. Dataset vs DataCatalog for `schema:name`). Best effort — unknown
 * formats return an empty map.
 */
export async function buildFocusNodeTypes(
  sourceText: string,
  contentType: ContentType,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (!sourceText.trim()) return result;

  if (contentType === 'application/ld+json') {
    collectJsonLd(safeParseJson(sourceText), null, result);
    return result;
  }

  if (
    contentType === 'text/turtle' ||
    contentType === 'application/n-triples' ||
    contentType === 'application/n-quads' ||
    contentType === 'application/trig' ||
    contentType === 'text/n3'
  ) {
    try {
      const { Parser } = await import('n3');
      const parser = new Parser({
        format: n3FormatFor(contentType) ?? 'Turtle',
      });
      for (const quad of parser.parse(sourceText)) {
        if (
          quad.predicate.value ===
            'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' &&
          !result.has(quad.subject.value)
        ) {
          result.set(quad.subject.value, quad.object.value);
        }
      }
    } catch {
      // ignore
    }
  }

  return result;
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function collectJsonLd(
  node: unknown,
  context: unknown,
  out: Map<string, string>,
): void {
  if (Array.isArray(node)) {
    for (const item of node) collectJsonLd(item, context, out);
    return;
  }
  if (!node || typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  const nextContext = obj['@context'] ?? context;
  if (obj['@graph']) collectJsonLd(obj['@graph'], nextContext, out);

  const id = obj['@id'];
  const type = obj['@type'];
  if (typeof id === 'string') {
    const typeStr = Array.isArray(type) ? type[0] : type;
    if (typeof typeStr === 'string') {
      out.set(id, expandType(typeStr, nextContext));
    }
  }

  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith('@')) continue;
    collectJsonLd(value, nextContext, out);
  }
}

function expandType(type: string, context: unknown): string {
  if (type.includes('://')) return type;
  if (typeof context === 'string') {
    return joinIri(context, type);
  }
  if (Array.isArray(context)) {
    for (const part of context) {
      const resolved = expandType(type, part);
      if (resolved.includes('://')) return resolved;
    }
    return type;
  }
  if (context && typeof context === 'object') {
    const map = context as Record<string, unknown>;
    const direct = map[type];
    if (typeof direct === 'string') return direct;
    if (
      direct &&
      typeof direct === 'object' &&
      '@id' in (direct as Record<string, unknown>)
    ) {
      return String((direct as Record<string, unknown>)['@id']);
    }
    const vocab = map['@vocab'];
    if (typeof vocab === 'string') return joinIri(vocab, type);
  }
  return type;
}

function joinIri(base: string, suffix: string): string {
  if (base.endsWith('/') || base.endsWith('#')) return base + suffix;
  return `${base}/${suffix}`;
}
