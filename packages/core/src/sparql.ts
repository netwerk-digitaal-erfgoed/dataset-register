import { DatasetStore, extractIri } from './dataset.js';
import { QueryEngine } from '@comunica/query-sparql';
import { Writer } from 'n3';
import {
  AllowedRegistrationDomainStore,
  Registration,
  RegistrationStore,
  toRdf,
} from './registration.js';
import { Rating, RatingStore } from './rate.js';
import type { DatasetCore, Quad } from '@rdfjs/types';
import { URL } from 'node:url';

const queryEngine = new QueryEngine();

export function stores(
  url: string,
  accessToken?: string,
  registrationsGraphIri = 'https://demo.netwerkdigitaalerfgoed.nl/registry/registrations',
  allowedRegistrationDomainsGraphIri = 'https://data.netwerkdigitaalerfgoed.nl/registry/allowed_domain_names',
  ratingGraphIri = 'https://data.netwerkdigitaalerfgoed.nl/registry/ratings',
) {
  const client = new SparqlClient(url, accessToken);

  return {
    datasetStore: new SparqlDatasetStore(client),
    registrationStore: new SparqlRegistrationStore(
      client,
      registrationsGraphIri,
    ),
    allowedRegistrationDomainStore: new SparqlAllowedRegistrationDomainStore(
      client,
      allowedRegistrationDomainsGraphIri,
    ),
    ratingStore: new SparqlRatingStore(client, ratingGraphIri),
  };
}

export class SparqlDatasetStore implements DatasetStore {
  constructor(private readonly client: SparqlClient) {}

  async countDatasets(): Promise<number> {
    const result = await this.client.query(`
      PREFIX dcat: <http://www.w3.org/ns/dcat#>

      SELECT (COUNT(?s) AS ?count) WHERE {
        ?s a dcat:Dataset .
      }`);
    const bindings = await result.toArray();

    return parseInt(bindings[0]!.get('count')!.value);
  }

  async countOrganisations(): Promise<number> {
    const result = await this.client.query(`
      PREFIX dcat: <http://www.w3.org/ns/dcat#>
      PREFIX dct: <http://purl.org/dc/terms/>

      SELECT (COUNT(DISTINCT(?publisher)) AS ?count) WHERE {
        ?s a dcat:Dataset ;
          dct:publisher ?publisher .
      }`);
    const bindings = await result.toArray();

    return parseInt(bindings[0]!.get('count')!.value);
  }

  async store(dataset: DatasetCore): Promise<void> {
    const graph = extractIri(dataset);
    const triples = await quadsToSparql([...dataset]);

    const sparqlUpdate = `
      CLEAR GRAPH <${graph}>;
      
      INSERT DATA {
        GRAPH <${graph}> {
          ${triples}
        }
      }`;

    await this.client.update(sparqlUpdate);
  }
}

export class SparqlRegistrationStore implements RegistrationStore {
  constructor(
    private readonly client: SparqlClient,
    private readonly graphIri: string,
  ) {}

  async findRegistrationsReadBefore(date: Date): Promise<Registration[]> {
    const result = await this.client.query(`
      PREFIX schema: <http://schema.org/>
      PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

      SELECT ?s ?datePosted ?validUntil ?dataset WHERE {
        GRAPH <${this.graphIri}> {
          ?s a schema:EntryPoint ;
            schema:datePosted ?datePosted ;
            schema:dateRead ?dateRead .
          OPTIONAL { ?s schema:validUntil ?validUntil . }
          OPTIONAL { ?s schema:about ?dataset . }
          FILTER (?dateRead < "${date.toISOString()}"^^xsd:dateTime)
        }
      }
    `);

    const bindings = await result.toArray();

    // Group by registration URL, collecting datasets
    const registrationMap = new Map<
      string,
      { datePosted: string; validUntil?: string; datasets: URL[] }
    >();

    for (const binding of bindings) {
      const url = binding.get('s')!.value;
      if (!registrationMap.has(url)) {
        registrationMap.set(url, {
          datePosted: binding.get('datePosted')!.value,
          validUntil: binding.get('validUntil')?.value,
          datasets: [],
        });
      }
      const dataset = binding.get('dataset');
      if (dataset) {
        registrationMap.get(url)!.datasets.push(new URL(dataset.value));
      }
    }

    return Array.from(registrationMap.entries()).map(
      ([url, data]) =>
        new Registration(
          new URL(url),
          new Date(data.datePosted),
          data.validUntil ? new Date(data.validUntil) : undefined,
          data.datasets,
        ),
    );
  }

  async findByUrl(url: URL): Promise<Registration | undefined> {
    const result = await this.client.query(`
      PREFIX schema: <http://schema.org/>

      SELECT ?datePosted ?validUntil ?dataset WHERE {
        GRAPH <${this.graphIri}> {
          <${url}> a schema:EntryPoint ;
            schema:datePosted ?datePosted .
          OPTIONAL { <${url}> schema:validUntil ?validUntil . }
          OPTIONAL { <${url}> schema:about ?dataset . }
        }
      }
    `);

    const bindings = await result.toArray();
    if (bindings.length === 0) {
      return undefined;
    }

    const datasets = bindings
      .map((b) => b.get('dataset')?.value)
      .filter((d): d is string => d !== undefined)
      .map((d) => new URL(d));

    return new Registration(
      url,
      new Date(bindings[0]!.get('datePosted')!.value),
      bindings[0]!.get('validUntil')
        ? new Date(bindings[0]!.get('validUntil')!.value)
        : undefined,
      datasets,
    );
  }

  async store(registration: Registration): Promise<void> {
    const quads = toRdf(registration);
    const triples = await quadsToSparql(quads);

    // Delete all triples related to this registration (registration itself and referenced datasets)
    // Need to delete both the registration and any dataset relationships it created
    const sparqlUpdate = `
      PREFIX schema: <http://schema.org/>
      
      WITH <${this.graphIri}>
      DELETE {
        <${registration.url}> ?p ?o .
        ?dataset ?dp ?do .
      }
      WHERE {
        {
          <${registration.url}> ?p ?o .
        } UNION {
          ?dataset schema:subjectOf <${registration.url}> .
          ?dataset ?dp ?do .
        } UNION {
          <${registration.url}> schema:about ?dataset .
          ?dataset ?dp ?do .
        }
      };
      
      INSERT DATA {
        GRAPH <${this.graphIri}> {
          ${triples}
        }
      }`;

    await this.client.update(sparqlUpdate);
  }
}

export class SparqlRatingStore implements RatingStore {
  constructor(
    private readonly client: SparqlClient,
    private readonly graphIri: string,
  ) {}

  async store(datasetUri: URL, rating: Rating): Promise<void> {
    await this.client.update(`
      PREFIX schema: <http://schema.org/>
      
      WITH <${this.graphIri}>
      DELETE {
        ?dataset schema:contentRating ?rating .
        ?rating ?p ?o .
      }
      WHERE {
        BIND(<${datasetUri}> as ?dataset)
        ?dataset schema:contentRating ?rating .
        ?rating ?p ?o .
      };

      INSERT DATA {
        GRAPH <${this.graphIri}> {
          <${datasetUri.toString()}> schema:contentRating [
            schema:bestRating ${rating.bestRating} ;
            schema:worstRating ${rating.worstRating} ;
            schema:ratingValue ${rating.score} ;
            schema:ratingExplanation "${rating.explanation}" ;
          ]
        }
      }
      `);
  }
}

export class SparqlClient {
  private readonly sources: [{ type: 'sparql'; value: string }];

  constructor(
    private readonly url: string,
    private readonly accessToken?: string,
  ) {
    this.sources = [
      {
        type: 'sparql',
        value: this.url,
      },
    ];
  }

  async query(query: string) {
    return await queryEngine.queryBindings(query, { sources: this.sources });
  }

  async queryBoolean(query: string) {
    return await queryEngine.queryBoolean(query, { sources: this.sources });
  }

  async update(operations: string) {
    await queryEngine.queryVoid(operations, {
      sources: this.sources,
      ...(this.accessToken && { fetch: authenticatedFetch(this.accessToken) }),
    });
  }
}

export class SparqlAllowedRegistrationDomainStore implements AllowedRegistrationDomainStore {
  constructor(
    private readonly client: SparqlClient,
    private readonly graphIri: string,
  ) {}

  async contains(...domainNames: Array<string>) {
    return await this.client.queryBoolean(`
      ASK {
        GRAPH <${this.graphIri}> {
          ?s <https://data.netwerkdigitaalerfgoed.nl/allowed_domain_names/def/domain_name> ?domainNames .
          VALUES ?domainNames { ${domainNames
            .map((domainName) => `"${domainName}"`)
            .join(' ')} 
          }
        }
      }`);
  }
}

export function authenticatedFetch(
  accessToken: string,
): typeof globalThis.fetch {
  return async (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${accessToken}`);

    return globalThis.fetch(input, {
      ...init,
      headers,
    });
  };
}

function quadsToSparql(quads: Quad[]): Promise<string> {
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
