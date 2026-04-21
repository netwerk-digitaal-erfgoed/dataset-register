/**
 * Shared helpers for walking expanded JSON-LD responses from the API
 * (SHACL reports and the shapes index). Kept deliberately small — we only
 * need enough structure to read `@id` / `@value` / `@language` fields.
 */

export function pickFirst(values: unknown): unknown {
  return Array.isArray(values) ? values[0] : values;
}

export function pickIri(values: unknown): string | undefined {
  const first = pickFirst(values);
  if (first && typeof first === 'object' && '@id' in first) {
    return String((first as { '@id': unknown })['@id']);
  }
  return undefined;
}

export function pickLiteral(values: unknown): string | null {
  const first = pickFirst(values);
  if (first && typeof first === 'object' && '@value' in first) {
    return String((first as { '@value': unknown })['@value']);
  }
  return null;
}

export function pickAny(
  values: unknown,
): { value: string; isIri: boolean } | undefined {
  const first = pickFirst(values);
  if (!first || typeof first !== 'object') return undefined;
  if ('@id' in first) {
    return { value: String((first as { '@id': unknown })['@id']), isIri: true };
  }
  if ('@value' in first) {
    return {
      value: String((first as { '@value': unknown })['@value']),
      isIri: false,
    };
  }
  return undefined;
}

/**
 * Fallback order: requested locale → `en` → `nl` → any untagged literal.
 */
export function pickLocalized(
  values: unknown,
  locale: string,
): string | undefined {
  if (!values) return undefined;
  const array = Array.isArray(values) ? values : [values];
  const byLang = new Map<string, string>();
  let untagged: string | undefined;
  for (const entry of array) {
    if (!entry || typeof entry !== 'object' || !('@value' in entry)) continue;
    const value = String((entry as { '@value': unknown })['@value']);
    const lang = (entry as { '@language'?: string })['@language'];
    if (lang) byLang.set(lang, value);
    else if (untagged === undefined) untagged = value;
  }
  return byLang.get(locale) ?? byLang.get('en') ?? byLang.get('nl') ?? untagged;
}

export function normalizeNodes<T = Record<string, unknown>>(json: unknown): T[] {
  if (Array.isArray(json)) return json as T[];
  if (json && typeof json === 'object') {
    const graph = (json as Record<string, unknown>)['@graph'];
    if (Array.isArray(graph)) return graph as T[];
    return [json as T];
  }
  return [];
}
