import rdf from 'rdf-ext';
import { URL } from 'node:url';
import { datasetType } from './query.ts';
import { Readable, Transform } from 'node:stream';
import { DataFactory, StreamParser } from 'n3';
import { StandardizeSchemaOrgPrefixToHttps } from './transform.ts';
import { FetchDocumentLoader } from 'jsonld-context-parser';
import { JsonLdParser } from 'jsonld-streaming-parser';
import { createRdfFetch } from './fetch.ts';
import type { DatasetCore, NamedNode } from '@rdfjs/types';
import type { ChangeStatus } from '@lde/change-detection';

/**
 * The version of how we convert a fetched dataset description into what we store, stored with
 * each description’s content hash. Bump it whenever that conversion changes what gets stored,
 * so a change of ours is told apart from a change by the publisher.
 */
export const CONVERSION_VERSION = '1';

/**
 * How a stored dataset description compares to the one stored before it (see
 * {@link ChangeStatus}). Two statuses say the comparison could not be made, although the
 * description was stored: `unhashable` when it is too costly to canonicalize and is stored without
 * a content hash, and `unknown` when the stored hash could not be read.
 */
export type DatasetWrite = ChangeStatus | 'unhashable' | 'unknown';

export interface DatasetStore {
  /**
   * Store a dataset description, replacing any triples that were previously stored for it.
   */
  store(dataset: DatasetCore): Promise<DatasetWrite>;

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
  return new URL(extractSubject(dataset).value);
}

/**
 * The dataset’s own subject, as the description writes it. Unlike {@link extractIri}, which
 * normalises it as a URL (`http://Example.org` becomes `http://example.org/`), this is the term the
 * description’s triples are actually about.
 */
export function extractSubject(dataset: DatasetCore): NamedNode {
  const quad = [
    ...dataset.match(
      null,
      DataFactory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
      datasetType,
    ),
  ][0];
  return DataFactory.namedNode(quad.subject.value);
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
