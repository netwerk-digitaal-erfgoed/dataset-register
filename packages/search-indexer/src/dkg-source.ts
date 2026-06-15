import type { SparqlClient } from '@dataset-register/core';

const VOID = 'http://rdfs.org/ns/void#';

/** Per-dataset enrichment read from the Dataset Knowledge Graph, keyed by IRI. */
export interface DkgEnrichment {
  readonly classes: string[];
  readonly terminologySources: string[];
  size?: number;
}

/**
 * Reads facet enrichment (class partitions, terminology sources, size) for every
 * dataset from the Dataset Knowledge Graph store. Decoupled from the register
 * read: the rebuild joins this with the register projection in memory by dataset
 * IRI, so register correctness never depends on DKG availability.
 */
export class DkgSource {
  constructor(private readonly client: SparqlClient) {}

  /**
   * Map of dataset IRI to its DKG enrichment. Each multi-valued property is read
   * in its own UNION branch (binding only its own variable) so the values never
   * multiply against each other into a cross-product.
   */
  async read(): Promise<Map<string, DkgEnrichment>> {
    const stream = await this.client.query(`
      SELECT ?dataset ?class ?terminologySource ?size WHERE {
        {
          ?dataset <${VOID}classPartition> ?partition .
          ?partition <${VOID}class> ?class .
        } UNION {
          [] a <${VOID}Linkset> ;
            <${VOID}subjectsTarget> ?dataset ;
            <${VOID}objectsTarget> ?terminologySource .
        } UNION {
          ?dataset <${VOID}triples> ?size .
        }
      }`);

    const byDataset = new Map<string, DkgEnrichment>();
    for (const binding of await stream.toArray()) {
      const iri = binding.get('dataset')?.value;
      if (iri === undefined) {
        continue;
      }
      const entry = byDataset.get(iri) ?? {
        classes: [],
        terminologySources: [],
      };
      const classIri = binding.get('class')?.value;
      if (classIri !== undefined && !entry.classes.includes(classIri)) {
        entry.classes.push(classIri);
      }
      const terminologySource = binding.get('terminologySource')?.value;
      if (
        terminologySource !== undefined &&
        !entry.terminologySources.includes(terminologySource)
      ) {
        entry.terminologySources.push(terminologySource);
      }
      const size = binding.get('size')?.value;
      if (size !== undefined) {
        entry.size = Math.trunc(Number(size));
      }
      byDataset.set(iri, entry);
    }
    return byDataset;
  }
}
