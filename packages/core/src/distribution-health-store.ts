import factory from 'rdf-ext';
import type { NamedNode } from '@rdfjs/types';
import type { SparqlClient } from './sparql.ts';

export interface DistributionHealthRecord {
  url: URL;
  lastProbedAt: Date;
  lastOutcome: NamedNode | null;
  lastSuccessAt: Date | null;
  firstFailureAt: Date | null;
  consecutiveFailures: number;
  /**
   * The opaque source-change fingerprint observed on this probe (probe:sourceFingerprint),
   * or null when none could be derived (a SPARQL endpoint, or a dump exposing neither a
   * usable date nor a byte size). Recorded on the reachability rail so the validity rail
   * can compare against it by value: a validity verdict applies only while the fingerprint
   * it was judged against still equals this one (the staleness gate, PRD #2103).
   */
  sourceFingerprint: string | null;
}

export interface DistributionHealthStore {
  get(url: URL): Promise<DistributionHealthRecord | null>;
  /**
   * Fetch the records for many URLs in one query, keyed by URL string; URLs without a stored
   * record are absent from the map. The crawler probes every distribution of a dataset at once,
   * so batching the reads collapses N round-trips into one.
   */
  getMany(urls: URL[]): Promise<Map<string, DistributionHealthRecord>>;
  store(record: DistributionHealthRecord): Promise<void>;
  delete(url: URL): Promise<void>;
}

/**
 * Triple-store-backed implementation. Records live in a dedicated named graph so the
 * operational data can be pruned or reset without touching the semantic dataset graph.
 */
export class SparqlDistributionHealthStore implements DistributionHealthStore {
  public constructor(
    private readonly client: SparqlClient,
    private readonly graphIri: string,
  ) {}

  public async get(url: URL): Promise<DistributionHealthRecord | null> {
    const records = await this.getMany([url]);
    return records.get(url.toString()) ?? null;
  }

  public async getMany(
    urls: URL[],
  ): Promise<Map<string, DistributionHealthRecord>> {
    const records = new Map<string, DistributionHealthRecord>();
    if (urls.length === 0) return records;

    const values = urls.map((url) => `<${url.toString()}>`).join(' ');
    const result = await this.client.query(`
      PREFIX nde-probe: <https://def.nde.nl/probe#>
      PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

      SELECT ?url ?lastProbedAt ?lastOutcome ?lastSuccessAt ?firstFailureAt ?consecutiveFailures ?sourceFingerprint
      FROM <${this.graphIri}>
      WHERE {
        VALUES ?url { ${values} }
        ?url a nde-probe:DistributionHealthRecord ;
            nde-probe:lastProbedAt ?lastProbedAt ;
            nde-probe:consecutiveFailures ?consecutiveFailures .
        OPTIONAL { ?url nde-probe:lastOutcome ?lastOutcome }
        OPTIONAL { ?url nde-probe:lastSuccessAt ?lastSuccessAt }
        OPTIONAL { ?url nde-probe:firstFailureAt ?firstFailureAt }
        OPTIONAL { ?url nde-probe:sourceFingerprint ?sourceFingerprint }
      }`);

    for (const row of await result.toArray()) {
      const urlValue = row.get('url')!.value;
      records.set(urlValue, {
        url: new URL(urlValue),
        lastProbedAt: new Date(row.get('lastProbedAt')!.value),
        lastOutcome: namedNodeOrNull(row.get('lastOutcome')),
        lastSuccessAt: dateOrNull(row.get('lastSuccessAt')),
        firstFailureAt: dateOrNull(row.get('firstFailureAt')),
        consecutiveFailures: parseInt(row.get('consecutiveFailures')!.value),
        sourceFingerprint: row.get('sourceFingerprint')?.value ?? null,
      });
    }
    return records;
  }

  public async store(record: DistributionHealthRecord): Promise<void> {
    const iri = record.url.toString();
    const triples = [
      `<${iri}> a nde-probe:DistributionHealthRecord .`,
      `<${iri}> nde-probe:lastProbedAt "${record.lastProbedAt.toISOString()}"^^xsd:dateTime .`,
      `<${iri}> nde-probe:consecutiveFailures "${record.consecutiveFailures}"^^xsd:integer .`,
    ];
    if (record.lastOutcome !== null) {
      triples.push(
        `<${iri}> nde-probe:lastOutcome <${record.lastOutcome.value}> .`,
      );
    }
    if (record.lastSuccessAt !== null) {
      triples.push(
        `<${iri}> nde-probe:lastSuccessAt "${record.lastSuccessAt.toISOString()}"^^xsd:dateTime .`,
      );
    }
    if (record.firstFailureAt !== null) {
      triples.push(
        `<${iri}> nde-probe:firstFailureAt "${record.firstFailureAt.toISOString()}"^^xsd:dateTime .`,
      );
    }
    if (record.sourceFingerprint !== null) {
      triples.push(
        `<${iri}> nde-probe:sourceFingerprint ${JSON.stringify(record.sourceFingerprint)} .`,
      );
    }

    await this.client.update(`
      PREFIX nde-probe: <https://def.nde.nl/probe#>
      PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

      WITH <${this.graphIri}>
      DELETE {
        <${iri}> ?p ?o .
      }
      WHERE {
        <${iri}> ?p ?o .
      };

      INSERT DATA {
        GRAPH <${this.graphIri}> {
          ${triples.join('\n          ')}
        }
      }
      `);
  }

  public async delete(url: URL): Promise<void> {
    await this.client.update(`
      WITH <${this.graphIri}>
      DELETE {
        <${url.toString()}> ?p ?o .
      }
      WHERE {
        <${url.toString()}> ?p ?o .
      }`);
  }
}

function dateOrNull(term: unknown): Date | null {
  if (term === undefined || term === null) return null;
  const value = (term as { value?: string }).value;
  return value === undefined ? null : new Date(value);
}

function namedNodeOrNull(term: unknown): NamedNode | null {
  if (term === undefined || term === null) return null;
  const typed = term as { termType?: string; value?: string };
  if (typed.termType !== 'NamedNode' || typed.value === undefined) return null;
  return factory.namedNode(typed.value);
}
