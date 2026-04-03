import { QueryEngine } from '@comunica/query-sparql';
import factory from 'rdf-ext';
import { Store } from 'n3';
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

export async function* fetch(
  url: URL,
  data: DatasetExt,
): AsyncGenerator<DatasetExt> {
  try {
    yield* query(url, data);
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

async function* query(url: URL, data: DatasetExt) {
  // Work around Comunica bug where JSON-LD with @graph in HTML <script> tags
  // produces 0 results (comunica/comunica#1684). Use in-memory data as source
  // unless Hydra pagination is detected, which requires Comunica to follow links.
  const source = hasHydraPagination(data) ? url.toString() : toN3Store(data);
  const quadStream = await engine.queryQuads(constructQuery, {
    sources: [source],
  });

  // Collect quads grouped by dataset subject. UNION branches in the CONSTRUCT
  // query may interleave quads for different datasets, so we cannot rely on
  // stream order to split datasets.
  type Quad = ReturnType<typeof factory.quad>;
  const groupedQuads = new Map<string, Quad[]>();
  const datasetOrder: string[] = [];
  let currentDataset: string | undefined;

  for await (let quad of quadStream) {
    if (quad.predicate.equals(dcat('byteSize'))) {
      const bytes = normalizeByteSize(quad.object.value);
      if (bytes !== null) {
        quad = factory.quad(
          quad.subject,
          quad.predicate,
          factory.literal(
            String(bytes),
            factory.namedNode('http://www.w3.org/2001/XMLSchema#integer'),
          ),
        );
      }
    }

    if (
      quad.predicate.equals(rdf('type')) &&
      quad.object.equals(dcat('Dataset'))
    ) {
      if (!groupedQuads.has(quad.subject.value)) {
        groupedQuads.set(quad.subject.value, []);
        datasetOrder.push(quad.subject.value);
      }
      currentDataset = quad.subject.value;
    }

    // Route quad to the correct dataset: if the quad's subject is a known
    // dataset IRI, add it there; otherwise add it to the current dataset
    // (handles related entities like publishers and distributions).
    const targetDataset = groupedQuads.has(quad.subject.value)
      ? quad.subject.value
      : currentDataset;

    if (targetDataset !== undefined) {
      groupedQuads.get(targetDataset)!.push(quad);
    }
  }

  for (const datasetIri of datasetOrder) {
    yield factory.dataset(groupedQuads.get(datasetIri)!);
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

const HYDRA = 'http://www.w3.org/ns/hydra/core#';

function hasHydraPagination(data: DatasetExt): boolean {
  return data.some((quad) => quad.predicate.value.startsWith(HYDRA));
}

/**
 * Convert a DatasetExt to an N3 Store that Comunica can query as an in-memory source.
 * Quads are placed in the default graph so that SPARQL queries without GRAPH clauses can match them,
 * because rdf-dereference may place quads in named graphs (e.g. for embedded JSON-LD in HTML).
 */
function toN3Store(data: DatasetExt): Store {
  const store = new Store();
  for (const quad of data) {
    store.addQuad(factory.quad(quad.subject, quad.predicate, quad.object));
  }
  return store;
}

/**
 * Try to discover a data catalog at the well-known URL for the given origin.
 * Returns the dereferenced RDF data if the well-known URL contains valid RDF,
 * or null if it doesn't exist or contains no usable content.
 */
export async function discoverDatacatalog(
  url: URL,
): Promise<{ url: URL; data: DatasetExt } | null> {
  const wellKnownUrl = new URL('/.well-known/datacatalog', url.origin);
  try {
    const data = await dereference(wellKnownUrl);
    if (data.size === 0) {
      return null;
    }
    return { url: wellKnownUrl, data };
  } catch {
    return null;
  }
}

function normalizeByteSize(raw: string): number | null {
  const asInt = Number(raw);
  if (Number.isInteger(asInt) && asInt >= 0) return asInt;

  const match = raw.match(/^([0-9.]+)\s*(B|KB?|MB?|GB?|TB?)$/i);
  if (!match) return null;

  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  const multipliers: Record<string, number> = {
    B: 1,
    K: 1024,
    KB: 1024,
    M: 1048576,
    MB: 1048576,
    G: 1073741824,
    GB: 1073741824,
    T: 1099511627776,
    TB: 1099511627776,
  };
  return Math.floor(value * (multipliers[unit] ?? 1));
}
