import _rdfDereferencer, {RdfDereferencer} from 'rdf-dereference';
import _rdfSerializer, {RdfSerializer} from 'rdf-serialize';

/**
 * Wrap imports of RDF libraries that need to import .default in dev/prod compilation but without default in ts-jest.
 */
/* eslint-disable @typescript-eslint/ban-ts-comment */
export const rdfDereferencer: RdfDereferencer =
  // @ts-ignore
  _rdfDereferencer.default ?? _rdfDereferencer;

export const rdfSerializer: RdfSerializer =
  // @ts-ignore
  _rdfSerializer.default ?? _rdfSerializer;
