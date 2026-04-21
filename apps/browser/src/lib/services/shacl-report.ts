import { getLocale } from '$lib/paraglide/runtime';

export interface ParseOptions {
  locale?: string;
}

const SH = 'http://www.w3.org/ns/shacl#';
const RDF_TYPE = '@type';

const VALIDATION_REPORT = `${SH}ValidationReport`;
const VALIDATION_RESULT = `${SH}ValidationResult`;

export type Severity = 'Violation' | 'Warning' | 'Info';

export interface ShaclResult {
  severity: Severity;
  path?: string;
  focusNode?: string;
  focusNodeIsBlank?: boolean;
  value?: string;
  valueIsIri?: boolean;
  message: string;
  sourceShape?: string;
  sourceConstraintComponent?: string;
}

export interface ShaclReport {
  conforms: boolean;
  results: ShaclResult[];
}

type JsonLdNode = Record<string, unknown> & {
  '@id'?: string;
  '@type'?: string[];
};

/**
 * Parse a JSON-LD SHACL validation report into a locale-picked typed report.
 *
 * Accepts the expanded (array of nodes) shape returned by the Dataset Register
 * API. Blank-node results use `@id` values like `_:b2`; IRI references are
 * `{ '@id': '...' }`; literals are `{ '@value': '...', '@language'?, '@type'? }`.
 */
export function parseShaclReport(
  json: unknown,
  options: ParseOptions = {},
): ShaclReport {
  const locale = options.locale ?? getLocale();
  const nodes = normalizeNodes(json);
  const results: ShaclResult[] = [];
  let conforms: boolean | null = null;

  for (const node of nodes) {
    const types = node[RDF_TYPE] as string[] | undefined;
    if (!types) continue;

    if (types.includes(VALIDATION_REPORT)) {
      const conformsLiteral = pickLiteral(node[`${SH}conforms`]);
      if (conformsLiteral !== null) {
        conforms = conformsLiteral === 'true';
      }
      continue;
    }

    if (types.includes(VALIDATION_RESULT)) {
      const severity = parseSeverity(pickIri(node[`${SH}resultSeverity`]));
      if (!severity) continue;

      const focusNodeRef = pickIri(node[`${SH}focusNode`]);
      const valueRef = pickAny(node[`${SH}value`]);

      results.push({
        severity,
        path: pickIri(node[`${SH}resultPath`]),
        focusNode: focusNodeRef ?? undefined,
        focusNodeIsBlank: focusNodeRef?.startsWith('_:') ?? false,
        value: valueRef?.value,
        valueIsIri: valueRef?.isIri ?? false,
        message: pickLocalizedString(node[`${SH}resultMessage`], locale) ?? '',
        sourceShape: pickIri(node[`${SH}sourceShape`]),
        sourceConstraintComponent: pickIri(
          node[`${SH}sourceConstraintComponent`],
        ),
      });
    }
  }

  return {
    conforms: conforms ?? results.every((r) => r.severity !== 'Violation'),
    results,
  };
}

function normalizeNodes(json: unknown): JsonLdNode[] {
  if (Array.isArray(json)) return json as JsonLdNode[];
  if (json && typeof json === 'object') {
    const graph = (json as Record<string, unknown>)['@graph'];
    if (Array.isArray(graph)) return graph as JsonLdNode[];
    return [json as JsonLdNode];
  }
  return [];
}

function parseSeverity(iri: string | undefined): Severity | null {
  if (!iri) return null;
  if (iri === `${SH}Violation`) return 'Violation';
  if (iri === `${SH}Warning`) return 'Warning';
  if (iri === `${SH}Info`) return 'Info';
  return null;
}

function pickIri(values: unknown): string | undefined {
  const first = pickFirst(values);
  if (first && typeof first === 'object' && '@id' in first) {
    return (first as { '@id': string })['@id'];
  }
  return undefined;
}

function pickLiteral(values: unknown): string | null {
  const first = pickFirst(values);
  if (first && typeof first === 'object' && '@value' in first) {
    return String((first as { '@value': unknown })['@value']);
  }
  return null;
}

/**
 * Pick either an IRI reference or a literal value, telling the caller which.
 */
function pickAny(
  values: unknown,
): { value: string; isIri: boolean } | undefined {
  const first = pickFirst(values);
  if (!first || typeof first !== 'object') return undefined;
  if ('@id' in first) {
    return { value: String((first as { '@id': string })['@id']), isIri: true };
  }
  if ('@value' in first) {
    return {
      value: String((first as { '@value': unknown })['@value']),
      isIri: false,
    };
  }
  return undefined;
}

function pickFirst(values: unknown): unknown {
  if (Array.isArray(values)) return values[0];
  return values;
}

/**
 * Pick the best localized string from an array of `{ '@value', '@language' }`
 * objects. Falls back from the current locale → en → nl → any untagged → first.
 */
function pickLocalizedString(
  values: unknown,
  locale: string,
): string | undefined {
  if (!Array.isArray(values)) {
    const single = pickLiteral(values);
    return single ?? undefined;
  }
  const byLang = new Map<string, string>();
  let untagged: string | undefined;
  for (const entry of values) {
    if (!entry || typeof entry !== 'object' || !('@value' in entry)) continue;
    const value = String((entry as { '@value': unknown })['@value']);
    const lang = (entry as { '@language'?: string })['@language'];
    if (lang) byLang.set(lang, value);
    else if (untagged === undefined) untagged = value;
  }
  return (
    byLang.get(locale) ??
    byLang.get('en') ??
    byLang.get('nl') ??
    untagged ??
    (values[0] as { '@value'?: unknown })?.['@value']?.toString()
  );
}
