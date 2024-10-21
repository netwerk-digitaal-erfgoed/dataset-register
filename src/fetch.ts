import {QueryEngine} from '@comunica/query-sparql';
import factory from 'rdf-ext';
import DatasetExt from 'rdf-ext/lib/Dataset';
import {URL} from 'url';
import {constructQuery, dcat, rdf} from './query.js';
import {pipeline} from 'stream';
import {StandardizeSchemaOrgPrefixToHttps} from './transform.js';
import {rdfDereferencer} from 'rdf-dereference';

export class HttpError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
  }
}

export class NoDatasetFoundAtUrl extends Error {
  constructor(message = '') {
    super(`No dataset found at URL: ${message}`);
  }
}

export async function* fetch(url: URL): AsyncGenerator<DatasetExt> {
  try {
    yield* query(url);
  } catch (e) {
    handleComunicaError(e);
  }
}

/**
 * Fetch dataset description(s) by dereferencing the registration URL.
 */
export async function dereference(url: URL): Promise<DatasetExt> {
  try {
    const {data} = await rdfDereferencer.dereference(url.toString());
    const stream = pipeline(
      data,
      new StandardizeSchemaOrgPrefixToHttps(),
      () => {} // Noop because errors are caught below.
    );
    return await factory.dataset().import(stream);
  } catch (e) {
    handleComunicaError(e);
  }
}

/**
 * Use custom config to disable "ccqs:config/rdf-resolve-hypermedia-links/actors.json", which causes
 * many duplicate bindings and does not find any datasets on subsequent pages.
 * This is also a workaround for https://github.com/comunica/comunica/issues/1180.
 * The config file is based on https://github.com/comunica/comunica/blob/master/engines/config-query-sparql/config/config-default.json
 */
// const engine = await new QueryEngineFactory().create({
//   configPath: new URL('comunica-config.json', import.meta.url).toString(),
// });
const engine = new QueryEngine();

async function* query(url: URL) {
  const quadStream = await engine.queryQuads(constructQuery, {
    sources: [url.toString()],
  });
  let datasetQuads = [];
  let currentDataset: string | undefined;
  for await (const quad of quadStream) {
    if (
      quad.predicate.equals(rdf('type')) &&
      quad.object.equals(dcat('Dataset'))
    ) {
      currentDataset ??= quad.subject.value; // Set currentDataset to first dataset.

      if (quad.subject.value !== currentDataset) {
        // Start of a new dataset.
        currentDataset = quad.subject.value;
        yield factory.dataset(datasetQuads);
        datasetQuads = [];
      }
    }
    datasetQuads.push(quad);
  }

  if (datasetQuads.length > 0) {
    yield factory.dataset(datasetQuads);
  }
}

/**
 * Parse Comunica error response to throw a specific error class.
 */
function handleComunicaError(e: unknown): never {
  if (e instanceof Error) {
    // Match error thrown in Comunica’s ActorRdfDereferenceHttpParseBase.
    if (e.message.match(/404: unknown error/)) {
      throw new HttpError(e.message, 404);
    }

    const matches = e.message.match(/HTTP status (\d+)/);
    if (matches) {
      const statusCode = parseInt(matches[1]);
      throw new HttpError(e.message, statusCode);
    }

    throw new NoDatasetFoundAtUrl(e.message);
  }

  throw e;
}
