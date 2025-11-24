import type { DatasetCore } from '@rdfjs/types';
import factory from 'rdf-ext';

const hydra = (term: string) =>
  factory.namedNode(`http://www.w3.org/ns/hydra/core#${term}`);

/**
 * Create an RDF dataset representing a Hydra error.
 */
export function createHydraError(error: Error): DatasetCore {
  const dataset = factory.dataset();
  const errorNode = factory.blankNode();

  dataset.add(
    factory.quad(
      errorNode,
      factory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
      hydra('Error'),
    ),
  );
  dataset.add(
    factory.quad(errorNode, hydra('title'), factory.literal(error.message)),
  );

  if (error.cause && typeof error.cause === 'string') {
    dataset.add(
      factory.quad(
        errorNode,
        hydra('description'),
        factory.literal(error.cause),
      ),
    );
  }

  return dataset;
}
