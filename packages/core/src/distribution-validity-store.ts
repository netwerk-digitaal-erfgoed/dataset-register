import type { Quad } from '@rdfjs/types';
import type { SparqlClient } from './sparql.js';
import { quadsToNTriples } from './rdf-serialize.js';
import { sparqlIri } from './sparql-iri.js';

export interface DistributionValidityStore {
  store(accessUrl: URL, quads: Quad[]): Promise<void>;
  /**
   * Replace the measurements of many distributions in one update. The store’s cost is per update
   * request, so the crawler writes the measurements of all distributions it probed together. A
   * measurement without quads clears the stored one. Each access URL must occur once.
   */
  storeMany(measurements: DistributionValidityMeasurement[]): Promise<void>;
  delete(accessUrl: URL): Promise<void>;
}

/** The quads of one distribution’s validity measurement, keyed by its access URL. */
export interface DistributionValidityMeasurement {
  accessUrl: URL;
  quads: Quad[];
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
    await this.storeMany([{ accessUrl, quads }]);
  }

  public async storeMany(
    measurements: DistributionValidityMeasurement[],
  ): Promise<void> {
    if (measurements.length === 0) return;

    const triples = await quadsToNTriples(
      measurements.flatMap((measurement) => measurement.quads),
    );
    const deleteMeasurements = deleteMeasurementsFor(
      measurements.map((measurement) => measurement.accessUrl),
      this.graphIri,
    );
    await this.client.update(
      triples === ''
        ? deleteMeasurements
        : `${deleteMeasurements};

      INSERT DATA {
        GRAPH <${this.graphIri}> {
          ${triples}
        }
      }`,
    );
  }

  public async delete(accessUrl: URL): Promise<void> {
    await this.storeMany([{ accessUrl, quads: [] }]);
  }
}

// Clears the validity measurements computed on distributions' access URLs,
// following the forward path measurement -> prov:Activity -> prov:Usage so the
// activity and usage nodes are removed with it. Anchored on dqv:computedOn +
// the validity metric so a graph shared with other measurements stays
// untouched.
function deleteMeasurementsFor(accessUrls: URL[], graphIri: string): string {
  const values = accessUrls
    .map((accessUrl) => `<${sparqlIri(accessUrl)}>`)
    .join(' ');
  // Each UNION branch carries the access URLs and the measurement anchor itself. QLever plans
  // UNION branches on their own, so with the anchor outside the UNION a branch scans every
  // ?subject ?p ?o in the graph and joins the anchor only afterwards. One branch per
  // structural node so each binds ?subject/?p/?o on its own: OPTIONAL with three independent
  // ?p/?o triples would instead form a Cartesian product of the measurement’s, activity’s, and
  // usage’s triples.
  const measurement = `VALUES ?distribution { ${values} }
          ?measurement dqv:computedOn ?distribution ;
            dqv:isMeasurementOf <https://def.nde.nl/metric#distribution-rdf-valid> .`;
  return `
      PREFIX dqv: <http://www.w3.org/ns/dqv#>
      PREFIX prov: <http://www.w3.org/ns/prov#>

      WITH <${graphIri}>
      DELETE {
        ?subject ?p ?o .
      }
      WHERE {
        {
          ${measurement}
          ?measurement ?p ?o .
          BIND(?measurement AS ?subject)
        } UNION {
          ${measurement}
          ?measurement prov:wasGeneratedBy ?subject .
          ?subject ?p ?o .
        } UNION {
          ${measurement}
          ?measurement prov:wasGeneratedBy ?activity .
          ?activity prov:qualifiedUsage ?subject .
          ?subject ?p ?o .
        }
      }`;
}
