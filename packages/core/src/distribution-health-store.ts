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
}

export interface DistributionHealthStore {
  get(url: URL): Promise<DistributionHealthRecord | null>;
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
    private readonly graphIri = 'urn:nde:distribution-health',
  ) {}

  public async get(url: URL): Promise<DistributionHealthRecord | null> {
    const result = await this.client.query(`
      PREFIX nde: <https://def.nde.nl#>
      PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

      SELECT ?lastProbedAt ?lastOutcome ?lastSuccessAt ?firstFailureAt ?consecutiveFailures
      FROM <${this.graphIri}>
      WHERE {
        <${url.toString()}> a nde:DistributionHealthRecord ;
            nde:lastProbedAt ?lastProbedAt ;
            nde:consecutiveFailures ?consecutiveFailures .
        OPTIONAL { <${url.toString()}> nde:lastOutcome ?lastOutcome }
        OPTIONAL { <${url.toString()}> nde:lastSuccessAt ?lastSuccessAt }
        OPTIONAL { <${url.toString()}> nde:firstFailureAt ?firstFailureAt }
      }
      LIMIT 1`);

    const bindings = await result.toArray();
    if (bindings.length === 0) return null;
    const row = bindings[0]!;

    return {
      url,
      lastProbedAt: new Date(row.get('lastProbedAt')!.value),
      lastOutcome: namedNodeOrNull(row.get('lastOutcome')),
      lastSuccessAt: dateOrNull(row.get('lastSuccessAt')),
      firstFailureAt: dateOrNull(row.get('firstFailureAt')),
      consecutiveFailures: parseInt(row.get('consecutiveFailures')!.value),
    };
  }

  public async store(record: DistributionHealthRecord): Promise<void> {
    const iri = record.url.toString();
    const triples = [
      `<${iri}> a nde:DistributionHealthRecord .`,
      `<${iri}> nde:lastProbedAt "${record.lastProbedAt.toISOString()}"^^xsd:dateTime .`,
      `<${iri}> nde:consecutiveFailures "${record.consecutiveFailures}"^^xsd:integer .`,
    ];
    if (record.lastOutcome !== null) {
      triples.push(`<${iri}> nde:lastOutcome <${record.lastOutcome.value}> .`);
    }
    if (record.lastSuccessAt !== null) {
      triples.push(
        `<${iri}> nde:lastSuccessAt "${record.lastSuccessAt.toISOString()}"^^xsd:dateTime .`,
      );
    }
    if (record.firstFailureAt !== null) {
      triples.push(
        `<${iri}> nde:firstFailureAt "${record.firstFailureAt.toISOString()}"^^xsd:dateTime .`,
      );
    }

    await this.client.update(`
      PREFIX nde: <https://def.nde.nl#>
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
