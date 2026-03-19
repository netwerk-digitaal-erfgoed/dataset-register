import { Transform } from 'node:stream';
import type { TransformCallback } from 'node:stream';
import factory from 'rdf-ext';
import { NamedNode } from 'n3';
import type { DatasetCore, Quad, Quad_Object } from '@rdfjs/types';
import type DatasetExt from 'rdf-ext/lib/Dataset.js';

/**
 * Replace http://schema.org with https://schema.org in a single named node.
 */
function replaceSchemaOrgPrefix(node: NamedNode) {
  return factory.namedNode(
    node.value.replace('http://schema.org', 'https://schema.org'),
  );
}

function standardizeObject(object: Quad_Object) {
  if (object.termType === 'Literal') {
    return factory.literal(
      object.value,
      object.language || replaceSchemaOrgPrefix(object.datatype as NamedNode),
    );
  }

  if (object.termType === 'NamedNode') {
    return replaceSchemaOrgPrefix(object as NamedNode);
  }

  return object;
}

/**
 * Convert http://schema.org prefix to https://schema.org in a single quad.
 */
function standardizeQuad(quad: Quad) {
  return factory.quad(
    quad.subject,
    quad.predicate.termType === 'NamedNode'
      ? replaceSchemaOrgPrefix(quad.predicate as NamedNode)
      : quad.predicate,
    standardizeObject(quad.object),
    quad.graph,
  );
}

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
  const standardized = factory.dataset();
  for (const quad of dataset) {
    standardized.add(standardizeQuad(quad));
  }
  return standardized;
}
