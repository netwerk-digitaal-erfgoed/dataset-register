import fetch, {Headers, Response} from 'node-fetch';
import DatasetExt from 'rdf-ext/lib/Dataset';
import factory from 'rdf-ext';
import {URL} from 'url';
import querystring from 'querystring';
import {Quad, Quad_Object, Quad_Predicate} from 'rdf-js';
import {Writer} from 'n3';
import {
  AllowedRegistrationDomainStore,
  Registration,
  RegistrationStore,
} from './registration.js';
import {DatasetStore, extractIris} from './dataset.js';
import {Rating, RatingStore} from './rate.js';
import http from 'node:http';

export type SparqlResult = {
  results: {
    bindings: Binding[];
  };
};

export type Binding = {
  [key: string]: {value: string};
};

/**
 * GraphDB client that uses the REST API.
 *
 * @see https://triplestore.netwerkdigitaalerfgoed.nl/webapi
 */
export class GraphDbClient {
  private token?: string;
  private username?: string;
  private password?: string;
  private agent = new http.Agent({keepAlive: false});

  constructor(
    private url: string,
    private repository: string
  ) {
    // Doesn't work with authentication: see https://github.com/Ontotext-AD/graphdb.js/issues/123
    // const config = new graphdb.repository.RepositoryClientConfig()
    //   .setEndpoints([url])
    //   .setUsername(username)
    //   .setPass(password);
    // this.repository = new graphdb.repository.RDFRepositoryClient(config);
  }

  public async authenticate(username: string, password: string) {
    this.username = username;
    this.password = password;

    const response = await fetch(this.url + '/rest/login/' + this.username, {
      method: 'POST',
      headers: {'X-Graphdb-Password': this.password!},
    });

    if (!response.ok) {
      throw Error(
        'Could not authenticate username ' +
          this.username +
          ' with GraphDB; got status code ' +
          response.status
      );
    }

    this.token = response.headers.get('Authorization')!;
  }

  public async request(options: {
    method: string;
    url?: string;
    body?: string;
    accept?: string;
    contentType?: string;
  }): Promise<Response> {
    const headers = await this.getHeaders();
    headers.set('Content-Type', options.contentType ?? 'application/x-trig');
    if (options.accept) {
      headers.set('Accept', options.accept);
    }
    const repositoryUrl =
      this.url + '/repositories/' + this.repository + options.url;
    const response = await fetch(repositoryUrl, {
      agent: this.agent,
      method: options.method,
      headers: headers,
      body: options.body,
    });
    if (
      // 409 = `Auth token hash mismatch`, which occurs after GraphDB has restarted.
      (response.status === 401 || response.status === 409) &&
      this.username !== undefined &&
      this.password !== undefined
    ) {
      this.token = undefined;
      // Retry original request.
      await this.request(options);
    }

    if (!response.ok) {
      console.error(
        'HTTP error ' +
          response.status +
          ' for ' +
          options.method +
          ' ' +
          repositoryUrl
      );
    }

    return response;
  }

  public async query(query: string): Promise<SparqlResult> {
    const response = await this.request({
      method: 'GET',
      url: '?' + querystring.stringify({query}),
      accept: 'application/sparql-results+json',
    });

    return (await response.json()) as SparqlResult;
  }

  public async update(payload: string): Promise<void> {
    const response = await this.request({
      method: 'POST',
      url: '/statements',
      body: payload,
      contentType: 'application/sparql-update',
    });

    if (!response.ok) {
      console.error(
        `${response.status} response for SPARQL update ${payload})`
      );
    }
  }

  private async getHeaders(): Promise<Headers> {
    if (this.username === undefined || this.password === undefined) {
      return new Headers();
    }

    if (this.token === undefined) {
      await this.authenticate(this.username, this.password);
    }

    return new Headers({Authorization: this.token!});
  }
}

export class GraphDbRegistrationStore implements RegistrationStore {
  private readonly registrationsGraph =
    'https://demo.netwerkdigitaalerfgoed.nl/registry/registrations';

  constructor(private client: GraphDbClient) {}

  async store(registration: Registration): Promise<void> {
    const quads = [
      this.registrationQuad(
        registration,
        factory.namedNode('http://schema.org/datePosted'),
        factory.literal(
          registration.datePosted.toISOString(),
          factory.namedNode('http://www.w3.org/2001/XMLSchema#dateTime')
        )
      ),
      this.registrationQuad(
        registration,
        factory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
        factory.namedNode('http://schema.org/EntryPoint')
      ),
      this.registrationQuad(
        registration,
        factory.namedNode('http://schema.org/encoding'),
        factory.namedNode('http://schema.org') // Currently the only vocabulary that we support.
      ),
      ...registration.datasets.flatMap(datasetIri => {
        const datasetQuads = [
          this.registrationQuad(
            registration,
            factory.namedNode('http://schema.org/about'),
            factory.namedNode(datasetIri.toString())
          ),
          factory.quad(
            factory.namedNode(datasetIri.toString()),
            factory.namedNode(
              'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
            ),
            factory.namedNode('http://schema.org/Dataset'),
            factory.namedNode(this.registrationsGraph)
          ),
          factory.quad(
            factory.namedNode(datasetIri.toString()),
            factory.namedNode('http://schema.org/subjectOf'),
            factory.namedNode(registration.url.toString()),
            factory.namedNode(this.registrationsGraph)
          ),
        ];
        if (registration.dateRead !== undefined) {
          datasetQuads.push(
            factory.quad(
              factory.namedNode(datasetIri.toString()),
              factory.namedNode('http://schema.org/dateRead'),
              factory.literal(
                registration.dateRead.toISOString(),
                factory.namedNode('http://www.w3.org/2001/XMLSchema#dateTime')
              ),
              factory.namedNode(this.registrationsGraph)
            )
          );
        }
        return datasetQuads;
      }),
    ];
    if (registration.dateRead !== undefined) {
      quads.push(
        this.registrationQuad(
          registration,
          factory.namedNode('http://schema.org/dateRead'),
          factory.literal(
            registration.dateRead.toISOString(),
            factory.namedNode('http://www.w3.org/2001/XMLSchema#dateTime')
          )
        )
      );
    }

    if (registration.statusCode !== undefined) {
      quads.push(
        this.registrationQuad(
          registration,
          factory.namedNode('http://schema.org/status'),
          factory.literal(
            registration.statusCode.toString(),
            factory.namedNode('http://www.w3.org/2001/XMLSchema#integer')
          )
        )
      );
    }

    if (registration.validUntil !== undefined) {
      quads.push(
        this.registrationQuad(
          registration,
          factory.namedNode('http://schema.org/validUntil'),
          factory.literal(
            registration.validUntil.toISOString(),
            factory.namedNode('http://www.w3.org/2001/XMLSchema#dateTime')
          )
        )
      );
    }

    return new Promise((resolve, reject) => {
      getWriter(quads).end(async (error, result) => {
        try {
          await this.client.request({
            method: 'DELETE',
            url:
              '/statements?' +
              querystring.stringify({
                subj: '<' + registration.url.toString() + '>',
                context: '<' + this.registrationsGraph + '>',
              }),
          });
          await this.client.request({
            method: 'POST',
            url: '/statements',
            body: result,
          });
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  async findRegistrationsReadBefore(date: Date): Promise<Registration[]> {
    // Use STR(?dateRead) as a workaround for https://github.com/netwerk-digitaal-erfgoed/register/issues/45
    const result = await this.client.query(`
      PREFIX schema: <http://schema.org/>
      SELECT ?s ?datePosted ?validUntil WHERE {
        GRAPH <${this.registrationsGraph}> {
          ?s a schema:EntryPoint ;
            schema:datePosted ?datePosted ;
            schema:dateRead ?dateRead .
          OPTIONAL { ?s schema:validUntil ?validUntil . }
          FILTER (STR(?dateRead) < "${date.toISOString()}")  
        }
      } GROUP BY ?s ?datePosted ?validUntil`);

    return result.results.bindings.map(
      binding =>
        new Registration(
          new URL(binding.s.value),
          new Date(binding.datePosted.value),
          binding.validUntil ? new Date(binding.validUntil.value) : undefined
        )
    );
  }

  private registrationQuad = (
    registration: Registration,
    predicate: Quad_Predicate,
    object: Quad_Object
  ) =>
    factory.quad(
      factory.namedNode(registration.url.toString()),
      predicate,
      object,
      factory.namedNode(this.registrationsGraph)
    );
}

export class GraphDbAllowedRegistrationDomainStore
  implements AllowedRegistrationDomainStore
{
  constructor(
    private readonly client: GraphDbClient,
    private readonly allowedDomainNamesGraph = 'https://data.netwerkdigitaalerfgoed.nl/registry/allowed_domain_names'
  ) {}

  async contains(...domainNames: Array<string>) {
    const result = await this.client.query(`
      SELECT * WHERE {
        GRAPH <${this.allowedDomainNamesGraph}> {
          ?s <https://data.netwerkdigitaalerfgoed.nl/allowed_domain_names/def/domain_name> ?domainNames .
          VALUES ?domainNames { ${domainNames
            .map(domainName => `"${domainName}"`)
            .join(' ')} }
        }
      }`);

    return result.results.bindings.length > 0;
  }
}

export class GraphDbDatasetStore implements DatasetStore {
  constructor(private readonly client: GraphDbClient) {}

  public async countDatasets(): Promise<number> {
    const result = await this.client.query(`
      PREFIX dcat: <http://www.w3.org/ns/dcat#>

      SELECT (COUNT(?s) as ?count) WHERE {
        ?s a dcat:Dataset .
      }`);

    return parseInt(result.results.bindings[0].count.value);
  }

  public async countOrganisations(): Promise<number> {
    const result = await this.client.query(`
      PREFIX dcat: <http://www.w3.org/ns/dcat#>
      PREFIX dct: <http://purl.org/dc/terms/>

      SELECT (COUNT(DISTINCT(?publisher)) as ?count) WHERE {
        ?s a dcat:Dataset ;
          dct:publisher ?publisher .
      }`);

    return parseInt(result.results.bindings[0].count.value);
  }

  /**
   * Store the dataset using optimized graph replacement.
   *
   * @see https://graphdb.ontotext.com/documentation/standard/replace-graph.html
   */
  public async store(datasets: DatasetExt[]) {
    // Find each Dataset’s IRI.
    for (const [iri, dataset] of [...extractIris(datasets)]) {
      // Serialize requests: wait for each response before sending next request to prevent GraphDB from running OOM.
      await this.storeDataset(dataset, iri);
    }
  }

  private async storeDataset(dataset: DatasetExt, graphIri: URL) {
    await new Promise((resolve, reject) => {
      getWriter([...dataset.match(null, null, null, null)]).end(
        async (error, result) => {
          try {
            resolve(
              await this.client.request({
                method: 'PUT',
                url:
                  '/rdf-graphs/service?graph=' +
                  encodeURIComponent(graphIri.toString()),
                body: result,
              })
            );
          } catch (e) {
            reject(e);
          }
        }
      );
    });
  }
}

function getWriter(quads: Quad[]): Writer {
  const writer = new Writer({format: 'application/x-trig'});
  writer.addQuads(quads);

  return writer;
}

export class GraphDbRatingStore implements RatingStore {
  private readonly graph =
    'https://data.netwerkdigitaalerfgoed.nl/registry/ratings';

  constructor(private readonly client: GraphDbClient) {}
  async store(datasetUri: URL, rating: Rating): Promise<void> {
    await this.client.update(`
      PREFIX schema: <http://schema.org/>
      
      WITH <${this.graph}>
      DELETE {
        ?dataset schema:contentRating ?rating .
        ?rating ?p ?o .
      }
      WHERE {
        BIND(<${datasetUri}> as ?dataset)
        ?dataset schema:contentRating ?rating .
        ?rating ?p ?o .
      };

      WITH <${this.graph}>
      INSERT {
        <${datasetUri}> schema:contentRating [
          schema:bestRating ${rating.bestRating} ;
          schema:worstRating ${rating.worstRating} ;
          schema:ratingValue ${rating.score} ;
          schema:ratingExplanation "${rating.explanation}" ;
        ]
      }
      WHERE {}
    `);
  }
}
