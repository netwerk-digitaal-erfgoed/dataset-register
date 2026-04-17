import { Transform } from 'node:stream';
import type { TransformCallback } from 'node:stream';
import factory from 'rdf-ext';
import type { DatasetCore, NamedNode, Quad } from '@rdfjs/types';
import type DatasetExt from 'rdf-ext/lib/Dataset.js';
import { dcat, dct, foaf, vcard } from './query.ts';
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
export function addDefaultLanguageTags(
  quads: Quad[],
  lang = 'nl',
): DatasetExt {
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
  const result: Quad[] = [];
  for (const quad of quads) {
    if (
      !quad.predicate.equals(dct('temporal')) ||
      quad.object.termType !== 'Literal'
    ) {
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
      factory.quad(periodOfTime, rdfType, dct('PeriodOfTime'), quad.graph),
    );
    if (parsed.start !== undefined) {
      result.push(
        factory.quad(
          periodOfTime,
          dcat('startDate'),
          factory.literal(parsed.start, xsdDatatypeForIsoPoint(parsed.start)),
          quad.graph,
        ),
      );
    }
    if (parsed.end !== undefined) {
      result.push(
        factory.quad(
          periodOfTime,
          dcat('endDate'),
          factory.literal(parsed.end, xsdDatatypeForIsoPoint(parsed.end)),
          quad.graph,
        ),
      );
    }
  }
  return result;
}

const rdfType = factory.namedNode(
  'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
);

function xsdDatatypeForIsoPoint(value: string): NamedNode {
  const body = value.startsWith('-') ? value.slice(1) : value;
  if (body.includes('T')) return xsdDatatypes.dateTime;
  const separators = (body.match(/-/g) ?? []).length;
  if (separators === 0) return xsdDatatypes.gYear;
  if (separators === 1) return xsdDatatypes.gYearMonth;
  return xsdDatatypes.date;
}

const xsdDatatypes = {
  gYear: factory.namedNode('http://www.w3.org/2001/XMLSchema#gYear'),
  gYearMonth: factory.namedNode('http://www.w3.org/2001/XMLSchema#gYearMonth'),
  date: factory.namedNode('http://www.w3.org/2001/XMLSchema#date'),
  dateTime: factory.namedNode('http://www.w3.org/2001/XMLSchema#dateTime'),
} as const;

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
