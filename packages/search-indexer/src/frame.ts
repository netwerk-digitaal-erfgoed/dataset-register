import type { Quad } from '@rdfjs/types';
import jsonld from 'jsonld';

/** A framed JSON-LD dataset node (full-IRI keys); the engine-agnostic IR. */
export type FramedDataset = Record<string, unknown>;

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const DCAT_DATASET = 'http://www.w3.org/ns/dcat#Dataset';

/** Frame describing the dataset RDF shape (NOT Typesense fields) so the IR stays
 *  engine-agnostic. No `@context`, so framed keys are full predicate IRIs. */
const DATASET_FRAME = { '@type': DCAT_DATASET };
const FRAME_OPTIONS = { omitGraph: false, embed: '@always' as const };

/**
 * Frame the merged register + DKG CONSTRUCT quads into one JSON-LD IR node per
 * dataset. Each dataset’s own triples plus the one-hop nodes it references
 * (publisher, creator, distributions) are framed independently and yielded one
 * at a time, so memory stays flat at scale — whole-graph `jsonld.frame()` is
 * ~O(N²). QLever does not dedupe CONSTRUCT output, so duplicate triples are
 * collapsed before framing.
 */
export async function* frameDatasets(
  quads: readonly Quad[],
): AsyncIterable<FramedDataset> {
  for (const subgraph of groupByDataset(quads)) {
    const expanded = await jsonld.fromRDF(subgraph);
    const framed = await jsonld.frame(expanded, DATASET_FRAME, FRAME_OPTIONS);
    const node = (framed['@graph'] as FramedDataset[] | undefined)?.[0];
    if (node !== undefined) {
      yield node;
    }
  }
}

/** One self-contained quad subgraph per dataset: its own (deduped) triples plus
 *  the triples of the one-hop IRI nodes it references. */
function groupByDataset(quads: readonly Quad[]): Quad[][] {
  const bySubject = new Map<string, Quad[]>();
  const datasetIris = new Set<string>();
  const seen = new Set<string>();
  for (const quad of quads) {
    const key = `${quad.subject.value} ${quad.predicate.value} ${quad.object.value} ${quad.object.termType === 'Literal' ? quad.object.language || quad.object.datatype.value : ''}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const subject = quad.subject.value;
    const owned = bySubject.get(subject);
    if (owned === undefined) {
      bySubject.set(subject, [quad]);
    } else {
      owned.push(quad);
    }
    if (quad.predicate.value === RDF_TYPE && quad.object.value === DCAT_DATASET) {
      datasetIris.add(subject);
    }
  }

  return [...datasetIris].map((iri) => {
    const owned = bySubject.get(iri) ?? [];
    const referenced = owned
      .filter((quad) => quad.object.termType === 'NamedNode')
      .flatMap((quad) => bySubject.get(quad.object.value) ?? []);
    return [...owned, ...referenced];
  });
}
