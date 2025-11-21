import { QueryEngine } from '@comunica/query-sparql';
import factory from 'rdf-ext';
import { constructQuery, dcat, rdf } from './query.ts';
import { pipeline } from 'node:stream';
import { StandardizeSchemaOrgPrefixToHttps } from './transform.ts';
import { rdfDereferencer } from 'rdf-dereference';
import type DatasetExt from 'rdf-ext/lib/Dataset.js';

export class FetchError extends Error {}

export class HttpError extends FetchError {
  public readonly statusCode: number;

  constructor(url: URL, message: string, statusCode: number) {
    super(`URL ${url.toString()} returned HTTP error`, {
      cause: `The provided URL ${url.toString()} returned HTTP status code ${statusCode}: ${message}`,
    });
    this.statusCode = statusCode;
  }
}

export class NoDatasetFoundAtUrl extends FetchError {
  constructor(url: URL, message?: string) {
    super(`No dataset found at URL ${url.toString()}`, {
      cause: `The provided URL does not contain either a schema:Dataset or a dcat:Dataset${message ? ': ' + message : ''}. Please ensure your submitted URL includes at least one dataset description.`,
    });
  }
}

export class InvalidContentType extends FetchError {
  constructor(url: URL, mediaType: string) {
    super(`Invalid Content-Type at ${url.toString()}`, {
      cause: `URL returned an unrecognized or invalid Content-Type header: ${mediaType}. Please ensure the URL returns a valid RDF content type such as text/turtle or application/ld+json.`,
    });
  }
}

export async function* fetch(url: URL): AsyncGenerator<DatasetExt> {
  try {
    yield* query(url);
  } catch (e) {
    handleComunicaError(e, url);
  }
}

/**
 * Fetch dataset description(s) by dereferencing the registration URL.
 */
export async function dereference(url: URL): Promise<DatasetExt> {
  try {
    const { data } = await rdfDereferencer.dereference(url.toString());
    const stream = pipeline(
      data,
      new StandardizeSchemaOrgPrefixToHttps(),
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      () => {}, // Noop because errors are caught below.
    );
    return await factory.dataset().import(stream);
  } catch (e) {
    handleComunicaError(e, url);
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
function handleComunicaError(e: unknown, url: URL): never {
  if (e instanceof Error) {
    // Match error thrown in Comunica’s ActorRdfDereferenceHttpParseBase.
    if (e.message.match(/404: unknown error/)) {
      throw new HttpError(url, e.message, 404);
    }

    const matches = e.message.match(/HTTP status (\d+)/);
    if (matches) {
      const statusCode = parseInt(matches[1]);
      throw new HttpError(url, e.message, statusCode);
    }

    // Extract media type from "Unrecognized media type: <type>" errors.
    const mediaTypeMatch = e.message.match(/Unrecognized media type: (.+)/);
    if (mediaTypeMatch) {
      throw new InvalidContentType(url, mediaTypeMatch[1]);
    }

    throw new NoDatasetFoundAtUrl(url, e.message);
  }

  throw e;
}
