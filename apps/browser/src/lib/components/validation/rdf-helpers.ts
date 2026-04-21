import { n3FormatFor, type ContentType } from './detect-content-type.js';

/**
 * Shared JSON-LD walking + n3 parsing helpers for the validation report's
 * focus-node type and current-value lookups.
 */

export function joinIri(base: string, suffix: string): string {
  if (base.endsWith('/') || base.endsWith('#')) return base + suffix;
  return `${base}/${suffix}`;
}

/**
 * Resolve a bare term, CURIE (`prefix:local`), or absolute IRI to its IRI
 * using the surrounding JSON-LD `@context`. Returns `null` when the term
 * cannot be resolved; callers that prefer the input back on miss can use
 * `expandTerm(...) ?? term`.
 */
export function expandTerm(term: string, context: unknown): string | null {
  if (term.includes('://')) return term;
  if (typeof context === 'string') return joinIri(context, term);
  if (Array.isArray(context)) {
    for (const part of context) {
      const resolved = expandTerm(term, part);
      if (resolved) return resolved;
    }
    return null;
  }
  if (context && typeof context === 'object') {
    const map = context as Record<string, unknown>;
    const direct = map[term];
    if (typeof direct === 'string') return direct;
    if (
      direct &&
      typeof direct === 'object' &&
      '@id' in (direct as Record<string, unknown>)
    ) {
      return String((direct as Record<string, unknown>)['@id']);
    }
    const colonIndex = term.indexOf(':');
    if (colonIndex > 0) {
      const prefix = term.slice(0, colonIndex);
      const local = term.slice(colonIndex + 1);
      const prefixTarget = map[prefix];
      if (typeof prefixTarget === 'string') {
        return joinIri(prefixTarget, local);
      }
    }
    const vocab = map['@vocab'];
    if (typeof vocab === 'string') return joinIri(vocab, term);
  }
  return null;
}

/**
 * Depth-first visit every object node in an expanded or compact JSON-LD tree,
 * threading the nearest enclosing `@context` to the visitor. `@graph` entries
 * are descended into so top-level catalogs are covered.
 */
export function walkJsonLd(
  root: unknown,
  visit: (node: Record<string, unknown>, context: unknown) => void,
): void {
  const recurse = (node: unknown, context: unknown) => {
    if (Array.isArray(node)) {
      for (const item of node) recurse(item, context);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    const nextContext = obj['@context'] ?? context;
    visit(obj, nextContext);
    for (const [key, value] of Object.entries(obj)) {
      if (key === '@context' || key === '@id' || key === '@type') continue;
      recurse(value, nextContext);
    }
  };
  recurse(root, null);
}

export function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function parseN3Quads(
  sourceText: string,
  contentType: ContentType,
): Promise<import('n3').Quad[]> {
  const format = n3FormatFor(contentType);
  if (!format) return [];
  try {
    const { Parser } = await import('n3');
    return new Parser({ format }).parse(sourceText);
  } catch {
    return [];
  }
}
