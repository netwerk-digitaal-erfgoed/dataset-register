import { getLocale } from '$lib/paraglide/runtime';
import {
  normalizeNodes,
  pickAny,
  pickIri,
  pickLiteral,
  pickLocalized,
} from './jsonld-helpers.js';

export interface ParseOptions {
  locale?: string;
}

const SH = 'http://www.w3.org/ns/shacl#';
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

/**
 * Key that collapses repeats of one constraint into a single row.
 *
 * Deliberately keyed on the focus node's *type* rather than its identity: a
 * catalog of 500 datasets that each lack a description stays one row, while a
 * catalog and a dataset that both lack one stay apart. Their results are
 * otherwise identical – same severity, path, constraint component and shared
 * `sh:message` – so without the type they would merge and the report would show
 * one problem where there are two. Callers that cannot resolve the type pass
 * nothing, which restores the previous collapse-everything behaviour.
 */
export function resultGroupKey(
  result: ShaclResult,
  focusNodeType?: string,
): string {
  return [
    result.severity,
    result.path ?? '',
    result.sourceConstraintComponent ?? '',
    result.message,
    focusNodeType ?? '',
  ].join(String.fromCharCode(1));
}

type JsonLdNode = Record<string, unknown> & {
  '@id'?: string;
  '@type'?: string[];
};

/**
 * Parse an expanded JSON-LD SHACL validation report into a typed, locale-picked
 * report. Blank-node results use `@id` values like `_:b2`; IRI references are
 * `{ '@id': '...' }`; literals are `{ '@value': '...', '@language'?, '@type'? }`.
 */
export function parseShaclReport(
  json: unknown,
  options: ParseOptions = {},
): ShaclReport {
  const locale = options.locale ?? getLocale();
  const nodes = normalizeNodes<JsonLdNode>(json);
  const results: ShaclResult[] = [];
  let conforms: boolean | null = null;

  for (const node of nodes) {
    const types = node['@type'];
    if (!types) continue;

    if (types.includes(VALIDATION_REPORT)) {
      const conformsLiteral = pickLiteral(node[`${SH}conforms`]);
      if (conformsLiteral !== null) conforms = conformsLiteral === 'true';
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
        message: pickLocalized(node[`${SH}resultMessage`], locale) ?? '',
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

function parseSeverity(iri: string | undefined): Severity | null {
  if (iri === `${SH}Violation`) return 'Violation';
  if (iri === `${SH}Warning`) return 'Warning';
  if (iri === `${SH}Info`) return 'Info';
  return null;
}
