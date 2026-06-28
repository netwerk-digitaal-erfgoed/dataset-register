import { Writer } from 'n3';
import { Readable } from 'node:stream';
import { text } from 'node:stream/consumers';
import { rdfSerializer } from 'rdf-serialize';
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

/**
 * Serialize quads to a string in the given RDF content type (e.g.
 * `application/ld+json`). Uses `rdf-serialize`, which — unlike the N3 `Writer`
 * above — supports JSON-LD, and Node's stream consumer to collect the result.
 */
export function serializeQuads(
  quads: Iterable<Quad>,
  contentType: string,
): Promise<string> {
  return text(rdfSerializer.serialize(Readable.from(quads), { contentType }));
}
