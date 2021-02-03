import fetch, {Headers, Response} from 'node-fetch';
import DatasetExt from 'rdf-ext/lib/Dataset';
import factory from 'rdf-ext';
import {URL} from 'url';
import querystring from 'querystring';
import {Quad} from 'rdf-js';
import {Writer} from 'n3';
import {Registration, RegistrationStore} from './registration';
import {DatasetStore, extractIris} from './dataset';

/**
 * GraphDB client that uses the REST API.
 *
 * @see https://triplestore.netwerkdigitaalerfgoed.nl/webapi
 */
export class GraphDbClient {
  private token?: string;
  private username?: string;
  private password?: string;

  constructor(private url: string, private repository: string) {
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

  public async request(
    method: string,
    url: string,
    body?: string
  ): Promise<Response> {
    const headers = await this.getHeaders();
    headers.set('Content-Type', 'application/x-trig');
    const repositoryUrl = this.url + '/repositories/' + this.repository + url;
    const response = await fetch(repositoryUrl, {
      method: method,
      headers: headers,
      body: body,
    });
    if (
      // 409 = `Auth token hash mismatch`, which occurs after GraphDB has restarted.
      (response.status === 401 || response.status === 409) &&
      this.username !== undefined &&
      this.password !== undefined
    ) {
      this.token = undefined;
      // Retry original request.
      await this.request(method, url, body);
    }

    if (!response.ok) {
      console.error(
        'HTTP error ' + response.status + ' for ' + method + ' ' + repositoryUrl
      );
    }

    return response;
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

  async store(registration: Registration) {
    await this.client.request(
      'DELETE',
      '/statements?' +
        querystring.stringify({
          subj: '<' + registration.url.toString() + '>',
          context: '<' + this.registrationsGraph + '>',
        })
    );
    const date = new Date().toISOString();
    const foundAtUrlQuads = [
      factory.quad(
        factory.namedNode(registration.url.toString()),
        factory.namedNode('http://schema.org/datePosted'),
        factory.literal(date, 'xsd:dateTime'),
        factory.namedNode(this.registrationsGraph)
      ),
      ...registration.foundDatasets.flatMap(datasetIri => [
        factory.quad(
          factory.namedNode(registration.url.toString()),
          factory.namedNode('http://schema.org/about'),
          factory.namedNode(datasetIri.toString()),
          factory.namedNode(this.registrationsGraph)
        ),
        factory.quad(
          factory.namedNode(registration.url.toString()),
          factory.namedNode('http://schema.org/encoding'),
          factory.namedNode('http://schema.org'), // Currently the only vocabulary that we support.
          factory.namedNode(this.registrationsGraph)
        ),
        factory.quad(
          factory.namedNode(datasetIri.toString()),
          factory.namedNode('http://schema.org/datePosted'),
          factory.literal(date, 'xsd:dateTime'),
          factory.namedNode(this.registrationsGraph)
        ),
      ]),
    ];

    await getWriter(foundAtUrlQuads).end(async (error, result) => {
      await this.client.request('POST', '/statements', result);
    });
  }
}

export class GraphDbDatasetStore implements DatasetStore {
  constructor(private readonly client: GraphDbClient) {}

  /**
   * Store the dataset using optimized graph replacement.
   *
   * @see https://graphdb.ontotext.com/documentation/standard/replace-graph.html
   */
  public async store(datasets: DatasetExt[]) {
    // Find each Dataset’s IRI.
    extractIris(datasets).forEach((dataset, iri) =>
      this.storeDataset(dataset, iri)
    );
  }

  private async storeDataset(dataset: DatasetExt, graphIri: URL) {
    await getWriter(dataset.toArray()).end(async (error, result) => {
      await this.client.request(
        'PUT',
        '/rdf-graphs/service?graph=' + graphIri.toString(),
        result
      );
    });
  }
}

function getWriter(quads: Quad[]): Writer {
  const writer = new Writer({format: 'application/x-trig'});
  writer.addQuads(quads);

  return writer;
}
