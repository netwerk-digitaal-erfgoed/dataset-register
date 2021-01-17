import DatasetExt from 'rdf-ext/lib/Dataset';
import factory from 'rdf-ext';
import fetch, {Headers, Response} from 'node-fetch';
import {Writer} from 'n3';
// const graphdb = require('graphdb');

export interface Store {
  /**
   * Store a dataset description, replacing any triples that were previously stored for the dataset.
   */
  store(dataset: DatasetExt): void;
}

export class GraphDbDataStore implements Store {
  private token?: string;

  constructor(
    private url: string,
    private repository: string,
    private username?: string,
    private password?: string
  ) {
    // Doesn't work with authentication: see https://github.com/Ontotext-AD/graphdb.js/issues/123
    // const config = new graphdb.repository.RepositoryClientConfig()
    //   .setEndpoints([url])
    //   .setUsername(username)
    //   .setPass(password);
    // this.repository = new graphdb.repository.RDFRepositoryClient(config);
  }

  private async request(
    method: string,
    url: string,
    body: string
  ): Promise<Response> {
    const headers = await this.authenticate();
    headers.set('Content-Type', 'application/x-trig');
    const repositoryUrl = this.url + '/repositories/' + this.repository + url;
    const response = await fetch(repositoryUrl, {
      method: method,
      headers: headers,
      body: body,
    });
    if (
      response.status === 401 &&
      this.username !== undefined &&
      this.password !== undefined
    ) {
      this.token = undefined;
      // Retry original request.
      await this.request(method, url, body);
    }

    if (!response.ok) {
      console.log(
        'HTTP error ' + response.status + ' for URL ' + repositoryUrl
      );
    }

    return response;
  }

  private async authenticate(): Promise<Headers> {
    if (this.username === null || this.password === null) {
      return new Headers();
    }

    if (this.token !== undefined) {
      return new Headers();
    }

    const response = await fetch(this.url + '/rest/login/' + this.username, {
      method: 'POST',
      headers: {'X-Graphdb-Password': this.password!},
    });
    this.token = response.headers.get('Authorization')!;

    return new Headers({Authorization: this.token});
  }

  /**
   * Store the dataset using optimized graph replacement.
   *
   * @see https://graphdb.ontotext.com/documentation/standard/replace-graph.html
   */
  public async store(dataset: DatasetExt) {
    const quad = dataset
      .match(
        null,
        factory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
        factory.namedNode('http://schema.org/Dataset')
      )
      .toArray()[0];

    const datasetUri = quad.subject.value;
    const writer = new Writer({format: 'application/trig'});
    writer.addQuads(dataset.toArray());
    await writer.end(async (error, result) => {
      await this.request(
        'PUT',
        '/rdf-graphs/service?graph=' + datasetUri,
        result
      );
    });

    // await this.repository.deleteStatements(
    //   undefined,
    //   undefined,
    //   undefined,
    //   datasetUri
    // );
    // await this.repository.addQuads(dataset.toArray(), datasetUri);
  }
}
