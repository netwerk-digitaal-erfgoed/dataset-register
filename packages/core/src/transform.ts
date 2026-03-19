import { Transform } from 'node:stream';
import type { TransformCallback } from 'node:stream';
import factory from 'rdf-ext';
import type { DatasetCore, Quad } from '@rdfjs/types';
import type DatasetExt from 'rdf-ext/lib/Dataset.js';

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
