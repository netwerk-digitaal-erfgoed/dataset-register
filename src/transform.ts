import {Transform, TransformCallback} from 'stream';
import factory from 'rdf-ext';
import {NamedNode} from 'n3';
import {Quad, Quad_Object} from '@rdfjs/types';

/**
 * Convert http://schema.org prefix to https://schema.org for consistency.
 *
 * All downstream code (such as SHACL validation) can then rely on https://schema.org.
 */
export class StandardizeSchemaOrgPrefixToHttps extends Transform {
  constructor() {
    super({objectMode: true});
  }

  _transform(
    chunk: Quad,
    encoding: BufferEncoding,
    callback: TransformCallback
  ) {
    const quad = factory.quad(
      chunk.subject,
      chunk.predicate.termType === 'NamedNode'
        ? this.replace(chunk.predicate as NamedNode)
        : chunk.predicate,
      this.object(chunk.object),
      chunk.graph
    );
    callback(null, quad);
  }

  replace(node: NamedNode) {
    return factory.namedNode(
      node.value.replace('http://schema.org', 'https://schema.org')
    );
  }

  object(object: Quad_Object) {
    if (object.termType === 'Literal') {
      return factory.literal(
        object.value,
        object.language || this.replace(object.datatype as NamedNode)
      );
    }

    if (object.termType === 'NamedNode') {
      return this.replace(object as NamedNode);
    }

    return object;
  }
}
