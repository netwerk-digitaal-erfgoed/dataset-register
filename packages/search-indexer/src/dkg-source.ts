import type { SparqlClient } from '@dataset-register/core';
import type { Quad } from '@rdfjs/types';

const VOID = 'http://rdfs.org/ns/void#';

/**
 * Reads facet enrichment (class partitions, terminology sources, size) for every
 * dataset from the Dataset Knowledge Graph store as frameable RDF. Decoupled
 * from the register read: the rebuild merges this into the same per-dataset
 * subgraph by dataset IRI, so register correctness never depends on DKG
 * availability.
 */
export class DkgSource {
  constructor(private readonly client: SparqlClient) {}

  /**
   * CONSTRUCT the DKG enrichment as dataset-keyed `urn:dr:` triples (`dr:class`,
   * `dr:terminologySource`, `dr:size`) so it merges, by dataset IRI, into the
   * same per-dataset subgraph the register CONSTRUCT produces — one unified
   * frame, no separate post-processing. Each multi-valued property is its own
   * UNION branch to avoid a cross-product.
   */
  async readQuads(): Promise<Quad[]> {
    return this.client.constructQuads(`
      PREFIX void: <${VOID}>
      PREFIX dr: <urn:dr:>
      CONSTRUCT {
        ?dataset dr:class ?class ; dr:terminologySource ?terminologySource ; dr:size ?size .
      } WHERE {
        { ?dataset void:classPartition/void:class ?class }
        UNION { [] a void:Linkset ; void:subjectsTarget ?dataset ; void:objectsTarget ?terminologySource }
        UNION { ?dataset void:triples ?size }
      }`);
  }

  /**
   * CONSTRUCT `?terminologySource dct:title ?label` for every terminology source
   * a linkset points at, feeding the sidecar `labels` collection (mirrors the
   * browser’s `dct:title` label on the terminology-source facet).
   */
  async readTerminologyLabelQuads(): Promise<Quad[]> {
    return this.client.constructQuads(`
      PREFIX void: <${VOID}>
      PREFIX dct: <http://purl.org/dc/terms/>
      CONSTRUCT { ?source dct:title ?label } WHERE {
        [] a void:Linkset ; void:objectsTarget ?source .
        ?source dct:title ?label .
      }`);
  }

  /**
   * CONSTRUCT `?class rdfs:label ?label` for every class used in a partition that
   * carries a label, feeding the sidecar `labels` collection so the class facet
   * can show a real name rather than only a shortened IRI.
   */
  async readClassLabelQuads(): Promise<Quad[]> {
    return this.client.constructQuads(`
      PREFIX void: <${VOID}>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      CONSTRUCT { ?class rdfs:label ?label } WHERE {
        [] void:class ?class .
        ?class rdfs:label ?label .
      }`);
  }
}
