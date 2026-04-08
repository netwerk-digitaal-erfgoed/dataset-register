import { Transform } from 'node:stream';
import type { TransformCallback } from 'node:stream';
import factory from 'rdf-ext';
import type { DatasetCore, Quad } from '@rdfjs/types';
import type DatasetExt from 'rdf-ext/lib/Dataset.js';
import { dcat, dct, foaf } from './query.ts';

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
  dataset: DatasetCore,
  lang = 'nl',
): DatasetExt {
  return factory.dataset([...dataset].map((quad) => addLanguageTag(quad, lang)));
}

const languageTagPredicates = new Set([
  dct('title').value,
  dct('alternative').value,
  dct('description').value,
  dcat('keyword').value,
  foaf('name').value,
  'http://www.w3.org/2006/vcard/ns#fn',
]);

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
