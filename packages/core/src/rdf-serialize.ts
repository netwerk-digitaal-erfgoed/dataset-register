import { Writer } from 'n3';
import type { Quad } from '@rdfjs/types';

/**
 * Serialize quads to an N-Triples string for embedding in a SPARQL update.
 * Shared by the stores that persist arbitrary quad sets (dataset, validation
 * report, registration, distribution validity) so the serialization lives in one
 * place rather than being re-implemented per store.
 */
export function quadsToNTriples(quads: Quad[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const writer = new Writer({ format: 'N-Triples' });
    writer.addQuads(quads);
    writer.end((error, result) => {
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    });
  });
}
