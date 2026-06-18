import type { Quad } from '@rdfjs/types';
import type { SparqlClient } from './sparql.js';
import { quadsToNTriples } from './rdf-serialize.js';

export interface DistributionValidityStore {
  store(accessUrl: URL, quads: Quad[]): Promise<void>;
  delete(accessUrl: URL): Promise<void>;
}

/**
 * Persists per-distribution RDF-validity quality measurements (the shallow
 * validity rail) in a dedicated named graph, keyed by the distribution's access
 * URL. The graph holds operational data that can be pruned or reset without
 * touching the semantic dataset graph, mirroring the distribution-health store.
 *
 * A measurement is replaced wholesale on every crawl: the previous
 * `dqv:QualityMeasurement` for the access URL – and the `prov:Activity` and
 * `prov:Usage` it links to – are deleted before the fresh quads are inserted, so
 * a verdict that flips (e.g. invalid → valid once a publisher fixes a dump)
 * leaves no stale `failure:reason` behind.
 */
export class SparqlDistributionValidityStore implements DistributionValidityStore {
  public constructor(
    private readonly client: SparqlClient,
    private readonly graphIri: string,
  ) {}

  public async store(accessUrl: URL, quads: Quad[]): Promise<void> {
    const triples = await quadsToNTriples(quads);
    await this.client.update(`
      ${deleteMeasurementFor(accessUrl, this.graphIri)}

      INSERT DATA {
        GRAPH <${this.graphIri}> {
          ${triples}
        }
      }`);
  }

  public async delete(accessUrl: URL): Promise<void> {
    await this.client.update(deleteMeasurementFor(accessUrl, this.graphIri));
  }
}

// Clears the validity measurement computed on a distribution's access URL,
// following the forward path measurement -> prov:Activity -> prov:Usage so the
// activity and usage nodes are removed with it. Anchored on dqv:computedOn +
// the validity metric so a graph shared with other measurements stays
// untouched.
function deleteMeasurementFor(accessUrl: URL, graphIri: string): string {
  const iri = accessUrl.toString();
  // One UNION branch per structural node so each binds ?subject/?p/?o on its
  // own. OPTIONAL with three independent ?p/?o triples would instead form a
  // Cartesian product of the measurement's, activity's, and usage's triples.
  return `
      PREFIX dqv: <http://www.w3.org/ns/dqv#>
      PREFIX prov: <http://www.w3.org/ns/prov#>

      WITH <${graphIri}>
      DELETE {
        ?subject ?p ?o .
      }
      WHERE {
        ?measurement dqv:computedOn <${iri}> ;
          dqv:isMeasurementOf <https://def.nde.nl/metric#distribution-rdf-valid> .
        {
          ?measurement ?p ?o .
          BIND(?measurement AS ?subject)
        } UNION {
          ?measurement prov:wasGeneratedBy ?subject .
          ?subject ?p ?o .
        } UNION {
          ?measurement prov:wasGeneratedBy ?activity .
          ?activity prov:qualifiedUsage ?subject .
          ?subject ?p ?o .
        }
      };`;
}
