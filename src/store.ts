import DatasetExt from 'rdf-ext/lib/Dataset';
import factory from 'rdf-ext';

const graphdb = require('graphdb');

export interface Store {
  /**
   * Store a dataset description, replacing any triples that were previously stored for the dataset.
   */
  store(dataset: DatasetExt): void;
}

export class GraphDbDataStore implements Store {
  private repository: RDFRepositoryClient;

  constructor(url: string, username?: string, password?: string) {
    const config = new graphdb.repository.RepositoryClientConfig()
      .setEndpoints([url])
      .setUsername(username)
      .setPass(password);
    this.repository = new graphdb.repository.RDFRepositoryClient(config);
  }

  async store(dataset: DatasetExt) {
    const quad = dataset
      .match(
        null,
        factory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
        factory.namedNode('http://schema.org/Dataset')
      )
      .toArray()[0];
    const datasetUri = quad.subject.value;
    await this.repository.deleteStatements(
      undefined,
      undefined,
      undefined,
      datasetUri
    );
    await this.repository.addQuads(dataset.toArray(), datasetUri);
  }
}
