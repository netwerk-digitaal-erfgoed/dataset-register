import { Transform } from 'node:stream';
import type { TransformCallback } from 'node:stream';
import factory from 'rdf-ext';
import type { DatasetCore, NamedNode, Quad } from '@rdfjs/types';
import type DatasetExt from 'rdf-ext/lib/Dataset.js';
import { dcat, dct, foaf, rdf, vcard, xsd } from './query.ts';
import { parseTemporalCoverage } from './temporal-coverage.ts';

/**
 * Convert http://schema.org prefix to https://schema.org for consistency.
 *
 * All downstream code (such as SHACL validation) can then rely on https://schema.org.
 */
export class StandardizeSchemaOrgPrefixToHttps extends Transform {
  constructor() {
    super({ objectMode: true });
  }

  override _transform(
    chunk: Quad,
    encoding: BufferEncoding,
    callback: TransformCallback,
  ) {
    callback(null, standardizeQuad(chunk));
  }
}

/**
 * Convert http://schema.org prefix to https://schema.org in an in-memory dataset.
 */
export function standardizeSchemaOrgPrefix(dataset: DatasetCore): DatasetExt {
  return factory.dataset([...dataset].map(standardizeQuad));
}

/**
 * Add a default language tag to untagged string literals on properties where language tags are expected.
 */
export function addDefaultLanguageTags(quads: Quad[], lang = 'nl'): DatasetExt {
  return factory.dataset(quads.map((quad) => addLanguageTag(quad, lang)));
}

const languageTagPredicates = new Set([
  dct('title').value,
  dct('alternative').value,
  dct('description').value,
  dcat('keyword').value,
  foaf('name').value,
  vcard('fn').value,
]);

/**
 * Rewrite `dct:temporal` literal values into DCAT `dct:PeriodOfTime` blank
 * nodes with `dcat:startDate` / `dcat:endDate`. Literal values that do not
 * parse as ISO 8601 are left untouched (SHACL will have already flagged them).
 * IRI values pass through — they already reference a PeriodOfTime resource.
 */
export function normalizeTemporalCoverage(quads: Quad[]): Quad[] {
  if (!quads.some(isTemporalCoverageLiteral)) return quads;

  const result: Quad[] = [];
  for (const quad of quads) {
    if (!isTemporalCoverageLiteral(quad)) {
      result.push(quad);
      continue;
    }

    const parsed = parseTemporalCoverage(quad.object.value);
    if (parsed === null) {
      result.push(quad);
      continue;
    }

    const periodOfTime = factory.blankNode();
    result.push(
      factory.quad(quad.subject, quad.predicate, periodOfTime, quad.graph),
      factory.quad(periodOfTime, rdf('type'), dctPeriodOfTime, quad.graph),
    );
    if (parsed.start !== undefined) {
      result.push(
        factory.quad(
          periodOfTime,
          dcatStartDate,
          factory.literal(parsed.start, xsdDatatypeForIsoPoint(parsed.start)),
          quad.graph,
        ),
      );
    }
    if (parsed.end !== undefined) {
      result.push(
        factory.quad(
          periodOfTime,
          dcatEndDate,
          factory.literal(parsed.end, xsdDatatypeForIsoPoint(parsed.end)),
          quad.graph,
        ),
      );
    }
  }
  return result;
}

const dctTemporal = dct('temporal');
const dctPeriodOfTime = dct('PeriodOfTime');
const dcatStartDate = dcat('startDate');
const dcatEndDate = dcat('endDate');
const xsdGYear = xsd('gYear');
const xsdGYearMonth = xsd('gYearMonth');
const xsdDate = xsd('date');
const xsdDateTime = xsd('dateTime');

function isTemporalCoverageLiteral(quad: Quad): boolean {
  return (
    quad.predicate.equals(dctTemporal) && quad.object.termType === 'Literal'
  );
}

function xsdDatatypeForIsoPoint(value: string): NamedNode {
  const body = value.startsWith('-') ? value.slice(1) : value;
  if (body.includes('T')) return xsdDateTime;
  const separators = (body.match(/-/g) ?? []).length;
  if (separators === 0) return xsdGYear;
  if (separators === 1) return xsdGYearMonth;
  return xsdDate;
}

function addLanguageTag(quad: Quad, lang: string): Quad {
  const object = quad.object;
  if (
    object.termType === 'Literal' &&
    object.language === '' &&
    languageTagPredicates.has(quad.predicate.value)
  ) {
    return factory.quad(
      quad.subject,
      quad.predicate,
      factory.literal(object.value, lang),
      quad.graph,
    );
  }
  return quad;
}

function standardizeQuad(quad: Quad): Quad {
  const replace = (value: string) =>
    value.startsWith('http://schema.org/')
      ? value.replace('http://schema.org/', 'https://schema.org/')
      : value;

  const object = quad.object;
  const standardizedObject =
    object.termType === 'NamedNode'
      ? factory.namedNode(replace(object.value))
      : object.termType === 'Literal'
        ? factory.literal(
            object.value,
            object.language ||
              factory.namedNode(replace(object.datatype.value)),
          )
        : object;

  return factory.quad(
    quad.subject,
    quad.predicate.termType === 'NamedNode'
      ? factory.namedNode(replace(quad.predicate.value))
      : quad.predicate,
    standardizedObject,
    quad.graph,
  );
}
