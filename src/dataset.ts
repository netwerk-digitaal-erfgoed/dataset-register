import DatasetExt from 'rdf-ext/lib/Dataset';
import factory from 'rdf-ext';
import {URL} from 'url';

export interface DatasetStore {
  /**
   * Store an array of dataset descriptions, replacing any triples that were previously stored for the datasets.
   */
  store(datasets: DatasetExt[]): void;
}

export function extractIris(datasets: DatasetExt[]): Map<URL, DatasetExt> {
  return datasets.reduce((map, dataset) => {
    const quad = dataset
      .match(
        null,
        factory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
        factory.namedNode('http://schema.org/Dataset')
      )
      .toArray()[0];
    const url = new URL(quad.subject.value);
    map.set(url, dataset);
    return map;
  }, new Map<URL, DatasetExt>());
}
