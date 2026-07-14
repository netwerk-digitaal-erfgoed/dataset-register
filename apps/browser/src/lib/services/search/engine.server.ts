import { Client } from 'typesense';
import { createTypesenseSearchEngine } from '@lde/search-typesense';
import {
  buildGraphQLSchema,
  type SearchContext,
} from '@lde/search-api-graphql';
import type { SearchEngine, SearchQuery } from '@lde/search';
import type { GraphQLSchema } from 'graphql';
import {
  CLASS_COLLECTION_ALIAS,
  ORGANIZATION_COLLECTION_ALIAS,
  SEARCH_COLLECTION_ALIAS,
  SEARCH_SCHEMA,
  TERMINOLOGY_SOURCE_COLLECTION_ALIAS,
} from '@dataset-register/core/search';

/**
 * The server-side search engine + GraphQL schema behind the `/graphql` endpoint.
 *
 * This module is `*.server.ts` so SvelteKit’s bundler keeps its Node-only
 * dependencies – the Typesense SDK (`node:stream`) and graphql-js – out of the
 * client bundle. The Typesense read key lives here in `process.env`, never in the
 * public client env, so it is never shipped to the browser (unlike the previous
 * client-direct-to-Typesense path).
 */

/** How long the engine caches each label-source collection in memory (5 min),
 *  matching the previous client-side label cache TTL. */
const LABEL_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Cap on the number of buckets returned per facet (Typesense `max_facet_values`).
 * Typesense defaults to 10, which truncated every sidebar facet – the class,
 * keyword and publisher facets each carry far more values than that, so the
 * sidebar could neither show nor search past the top 10. The browser filters the
 * facet search box client-side over the returned buckets, so the full list must
 * come back for search to cover it.
 *
 * This is a ceiling, not a fixed cost: a response carries only as many buckets as
 * the facet actually has, and facet queries are hit-less (`per_page: 0`) with
 * labels served from the in-memory cache, so raising it is free until a facet
 * grows past it. The highest-cardinality facet today is `class` at ~800 distinct
 * values (`keyword` ~680, `publisher` ~310); 2000 leaves comfortable headroom for
 * growth. A facet that ever approaches this wants server-side facet-value search
 * (Typesense `facet_query`) rather than a still-higher cap. */
const MAX_FACET_VALUES = 2000;

let engineSingleton: SearchEngine | undefined;
let schemaSingleton: GraphQLSchema | undefined;

/**
 * The GraphQL schema built from `SEARCH_SCHEMA` (one root field per `SearchType`).
 * The dataset query defaults to the valid-status filter when the caller sends no
 * status clause; the API’s skip-own-filter then still counts the status facet
 * across every status (so the invalid/gone toggles have counts), replacing the
 * previous per-facet `includeDefaultStatus` bookkeeping.
 */
export function searchGraphQLSchema(): GraphQLSchema {
  schemaSingleton ??= buildGraphQLSchema(SEARCH_SCHEMA, {
    types: {
      Dataset: {
        queryDefaults: (query: SearchQuery): SearchQuery =>
          query.where.some((clause) => clause.field === 'status')
            ? query
            : {
                ...query,
                where: [...query.where, { field: 'status', in: ['valid'] }],
              },
      },
    },
  });
  return schemaSingleton;
}

/** The per-request GraphQL context: the shared engine plus the request’s
 *  language preference (the active UI locale, sent as `Accept-Language`). */
export function searchContext(
  acceptLanguage: readonly string[],
): SearchContext {
  return { engine: engine(), acceptLanguage };
}

/**
 * The Typesense-backed engine, bound to the whole schema and its collection map
 * (one collection per label-source type, ADR 0008). Built once per server
 * process; the label cache is shared across requests and pods’ lifetimes.
 */
function engine(): SearchEngine {
  engineSingleton ??= createTypesenseSearchEngine(
    typesenseClient(),
    SEARCH_SCHEMA,
    {
      collections: {
        Dataset: SEARCH_COLLECTION_ALIAS,
        Organization: ORGANIZATION_COLLECTION_ALIAS,
        Class: CLASS_COLLECTION_ALIAS,
        TerminologySource: TERMINOLOGY_SOURCE_COLLECTION_ALIAS,
      },
      labelCacheTtlMs: LABEL_CACHE_TTL_MS,
      maxFacetValues: MAX_FACET_VALUES,
      // A label lookup failure degrades a reference to its bare IRI rather than
      // failing the whole search; log it so the cause is visible.
      onLabelError: (error) => console.error('Label resolution failed:', error),
    },
  );
  return engineSingleton;
}

/** A single-node Typesense client from the server env. Throws when unset so a
 *  misconfiguration surfaces as a clear error rather than silent empty results. */
function typesenseClient(): Client {
  const host = process.env.TYPESENSE_HOST;
  const apiKey = process.env.TYPESENSE_API_KEY;
  if (host === undefined || apiKey === undefined) {
    throw new Error(
      'Search backend not configured: set TYPESENSE_HOST and TYPESENSE_API_KEY.',
    );
  }
  return new Client({
    nodes: [
      {
        host,
        port: Number(process.env.TYPESENSE_PORT ?? '8108'),
        protocol: process.env.TYPESENSE_PROTOCOL ?? 'https',
      },
    ],
    apiKey,
    connectionTimeoutSeconds: 5,
  });
}
