import DatasetExt from 'rdf-ext/lib/Dataset';
import factory from 'rdf-ext';
import rdf from 'rdf-ext';
import {URL} from 'url';
import {datasetType} from './query.js';
import {Readable, Transform} from 'stream';
import {StreamParser} from 'n3';
import {JsonLdParser} from 'jsonld-streaming-parser';
import {StandardizeSchemaOrgPrefixToHttps} from './transform.js';
import {DatasetCore} from 'rdf-js';

export interface DatasetStore {
  /**
   * Store an array of dataset descriptions, replacing any triples that were previously stored for the datasets.
   */
  store(datasets: DatasetExt[]): Promise<void>;

  countDatasets(): Promise<number>;

  countOrganisations(): Promise<number>;
}

export function extractIri(dataset: DatasetCore): URL {
  const quad = [
    ...dataset.match(
      null,
      factory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
      datasetType
    ),
  ][0];
  return new URL(quad.subject.value);
}

export function extractIris(datasets: DatasetExt[]): Map<URL, DatasetExt> {
  return datasets.reduce((map, dataset) => {
    map.set(extractIri(dataset), dataset);
    return map;
  }, new Map<URL, DatasetExt>());
}

export async function load(
  stream: Readable,
  contentType: 'application/ld+json' | string
) {
  const parser =
    contentType === 'application/ld+json'
      ? new JsonLdParser() as unknown as Transform
      : new StreamParser();

  return new Promise((resolve, reject) =>
    rdf
      .dataset()
      .import(
        stream
          .pipe(parser)
          .on('error', error => reject(error))
          .pipe(new StandardizeSchemaOrgPrefixToHttps())
      )
      .then(data => resolve(data))
  );
}
