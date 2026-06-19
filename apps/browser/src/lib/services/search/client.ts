import type {
  DocumentSchema,
  SearchResponse,
} from 'typesense/lib/Typesense/Documents.js';
import { env } from '$env/dynamic/public';
import { LABELS_COLLECTION_ALIAS } from '@dataset-register/core/search';
import { createLabelResolver, type LabelResolver } from './labels.js';

/**
 * Whether a Typesense search backend is configured. The browser queries
 * Typesense directly with a search-only (read) key — scoped to search and safe
 * to expose — so this is a public-env feature flag; when unset, the app falls
 * back to its SPARQL path. A later iteration swaps this direct path for a
 * GraphQL API that runs the Typesense queries, behind the same service seam.
 */
export function isSearchConfigured(): boolean {
  return Boolean(
    env.PUBLIC_TYPESENSE_HOST && env.PUBLIC_TYPESENSE_SEARCH_ONLY_API_KEY,
  );
}

/**
 * Run a search against a Typesense collection over the HTTP API with `fetch`.
 *
 * We hit the REST endpoint directly rather than through the `typesense` SDK so
 * the bundle stays free of the SDK’s `axios`/`node:stream` dependency, which
 * breaks in the browser. The search-only key is public (read-scoped), so it is
 * safe to send from the client.
 */
export async function searchCollection<T extends DocumentSchema>(
  collection: string,
  params: Record<string, unknown>,
): Promise<SearchResponse<T>> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      // All Typesense search params are scalars/strings, so a plain stringify is
      // exact.
      query.set(key, String(value));
    }
  }
  const response = await fetch(
    `${baseUrl()}/collections/${encodeURIComponent(collection)}/documents/search?${query.toString()}`,
    { headers: apiKeyHeader() },
  );
  if (!response.ok) {
    throw new Error(
      `Typesense search failed (${response.status}): ${await response.text()}`,
    );
  }
  return (await response.json()) as SearchResponse<T>;
}

/**
 * Export every document of a Typesense collection as JSONL over the HTTP API.
 * Used to pull the (bounded) `labels` collection in one request.
 */
export async function exportCollection(collection: string): Promise<string> {
  const response = await fetch(
    `${baseUrl()}/collections/${encodeURIComponent(collection)}/documents/export`,
    { headers: apiKeyHeader() },
  );
  if (!response.ok) {
    throw new Error(
      `Typesense export failed (${response.status}): ${await response.text()}`,
    );
  }
  return response.text();
}

/**
 * Shared resolver for the sidecar `labels` collection, so its cached copy of the
 * (bounded) collection is reused across the session.
 */
export function labelResolver(): LabelResolver {
  resolver ??= createLabelResolver(() =>
    exportCollection(LABELS_COLLECTION_ALIAS),
  );
  return resolver;
}

let resolver: LabelResolver | undefined;

/** The Typesense HTTP API base URL from the public env. */
function baseUrl(): string {
  const protocol = env.PUBLIC_TYPESENSE_PROTOCOL ?? 'https';
  const host = env.PUBLIC_TYPESENSE_HOST ?? 'localhost';
  const port = Number(env.PUBLIC_TYPESENSE_PORT ?? '8108');
  return `${protocol}://${host}:${port}`;
}

/** The search-only API key header sent with every Typesense request. */
function apiKeyHeader(): Record<string, string> {
  return {
    'X-TYPESENSE-API-KEY': env.PUBLIC_TYPESENSE_SEARCH_ONLY_API_KEY ?? '',
  };
}
