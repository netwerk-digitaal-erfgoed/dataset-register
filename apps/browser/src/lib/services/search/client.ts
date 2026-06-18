import { Client } from 'typesense';
import { env } from '$env/dynamic/public';
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

let client: Client | undefined;
let resolver: LabelResolver | undefined;

/** Typesense client built from the public search-only key. */
export function searchClient(): Client {
  client ??= new Client({
    nodes: [
      {
        host: env.PUBLIC_TYPESENSE_HOST ?? 'localhost',
        port: Number(env.PUBLIC_TYPESENSE_PORT ?? '8108'),
        protocol: env.PUBLIC_TYPESENSE_PROTOCOL ?? 'https',
      },
    ],
    apiKey: env.PUBLIC_TYPESENSE_SEARCH_ONLY_API_KEY ?? '',
    connectionTimeoutSeconds: 5,
  });
  return client;
}

/**
 * Shared resolver for the sidecar `labels` collection, so its cached copy of the
 * (bounded) collection is reused across the session.
 */
export function labelResolver(): LabelResolver {
  resolver ??= createLabelResolver(searchClient());
  return resolver;
}
