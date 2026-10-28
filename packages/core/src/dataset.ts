import rdf from 'rdf-ext';
import { URL } from 'node:url';
import { datasetType } from './query.ts';
import { Readable, Transform } from 'node:stream';
import { DataFactory, StreamParser } from 'n3';
import { StandardizeSchemaOrgPrefixToHttps } from './transform.ts';
import { FetchDocumentLoader } from 'jsonld-context-parser';
import { JsonLdParser } from 'jsonld-streaming-parser';
import { createRdfFetch } from './fetch.ts';
import type { DatasetCore } from '@rdfjs/types';

export interface DatasetStore {
  /**
   * Store a dataset description, replacing any triples that were previously stored for it.
   */
  store(dataset: DatasetCore): Promise<void>;

  /**
   * Delete a dataset's named graph.
   */
  delete(datasetUri: URL): Promise<void>;

  /**
   * The IRIs of all stored datasets.
   */
  findAll(): Promise<URL[]>;

  /**
   * The access and download URLs of the distributions of the given datasets, as the
   * descriptions write them.
   */
  findDistributionUrls(datasetIris: URL[]): Promise<string[]>;

  /**
   * The access and download URLs of stored datasets that equal one of `urls` or add a
   * fragment to it, as the descriptions write them. The references of
   * `exceptDatasetIris` are not counted.
   */
  findReferencedDistributionUrls(
    urls: string[],
    exceptDatasetIris?: URL[],
  ): Promise<string[]>;

  countDatasets(): Promise<number>;

  countOrganisations(): Promise<number>;
}

export function extractIri(dataset: DatasetCore): URL {
  const quad = [
    ...dataset.match(
      null,
      DataFactory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
      datasetType,
    ),
  ][0];
  return new URL(quad.subject.value);
}

export async function load(
  stream: Readable,
  contentType: 'application/ld+json' | string,
) {
  const parser =
    contentType === 'application/ld+json'
      ? createJsonLdParser()
      : new StreamParser();

  return new Promise((resolve, reject) =>
    rdf
      .dataset()
      .import(
        stream
          .pipe(parser)
          .on('error', (error) => reject(error))
          .pipe(new StandardizeSchemaOrgPrefixToHttps()),
      )
      .then((data) => resolve(data)),
  );
}

/**
 * A JSON-LD parser that resolves schema.org’s context to ours. Anything parsing JSON-LD
 * directly – rather than through `rdf-dereference`, which takes a `fetch` – must use this
 * instead of constructing a bare `JsonLdParser`, or it fetches the live context and reads
 * a registration under different semantics than the crawler does.
 */
export function createJsonLdParser(): Transform {
  return new JsonLdParser({
    documentLoader: new FetchDocumentLoader(createRdfFetch()),
  }) as unknown as Transform;
}
