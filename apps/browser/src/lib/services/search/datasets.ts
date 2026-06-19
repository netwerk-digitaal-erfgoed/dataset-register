import type { Client } from 'typesense';
import type {
  SearchParams,
  SearchResponse,
} from 'typesense/lib/Typesense/Documents.js';
import {
  DEFAULT_SORTING_FIELD,
  SEARCH_COLLECTION_ALIAS,
  facetFields,
  queryBy,
  queryByWeights,
} from '@dataset-register/core';
import { fold } from '@lde/text-normalization';
import type { OrderBy, SearchRequest } from '../datasets.js';
import { searchClient } from './client.js';

/** The active UI locale, the locales the index carries per-locale fields for. */
export type SearchLocale = 'nl' | 'en';

/** One Typesense document, keyed by its `id` (the dataset IRI). */
export type SearchHitDocument = { id: string } & Record<string, unknown>;

/** A single facet bucket: its raw value (an IRI or group token) and count. */
export interface FacetCount {
  readonly value: string;
  readonly count: number;
}

/**
 * The parsed result of a dataset search: the matched documents (verbatim, to be
 * mapped to cards by a later slice), the total match count for paging, and the
 * facet buckets keyed by index field name (to be turned into the facet UI by a
 * later slice).
 */
export interface DatasetSearchResponse {
  readonly documents: SearchHitDocument[];
  readonly total: number;
  readonly facetCounts: Record<string, FacetCount[]>;
}

/** Paging, ordering, and locale for a {@link searchDatasets} call. */
export interface SearchOptions {
  readonly limit: number;
  readonly offset: number;
  readonly orderBy: OrderBy;
  readonly locale: SearchLocale;
}

/**
 * Run a dataset search against the Typesense `datasets` collection and parse the
 * response into a UI-agnostic shape. The Typesense client is injected so the
 * function is unit-testable against a mock; it defaults to the shared
 * search-only client. This is the seam a later GraphQL-backed implementation
 * slots into without touching the UI.
 */
export async function searchDatasets(
  request: SearchRequest,
  options: SearchOptions,
  client: Client = searchClient(),
): Promise<DatasetSearchResponse> {
  const parameters = buildSearchParams(request, options);
  const response = await client
    .collections<SearchHitDocument>(SEARCH_COLLECTION_ALIAS)
    .documents()
    .search(parameters, {});
  return parseSearchResponse(response);
}

/**
 * Build the Typesense {@link SearchParams} for a request. Pure (no client, no
 * env), so the query mapping — `q` folding, `query_by`/weights, `filter_by`
 * clauses, `sort_by`, `facet_by` — is asserted directly in tests.
 */
export function buildSearchParams(
  request: SearchRequest,
  options: SearchOptions,
): SearchParams<SearchHitDocument> {
  const { limit, offset, orderBy, locale } = options;
  return {
    q:
      request.query !== undefined && request.query.length > 0
        ? fold(request.query)
        : '*',
    query_by: queryBy(),
    query_by_weights: queryByWeights(),
    per_page: limit,
    page: Math.floor(offset / limit) + 1,
    facet_by: facetFields().join(','),
    filter_by: buildFilterBy(request),
    sort_by: buildSortBy(orderBy, locale),
  };
}

// Group tokens (`group:rdf`/`group:sparql` for format, `group:*` for class)
// select against the index’s `_group` companion field rather than the granular
// field; everything else is a granular value (a media type or a class IRI).
const GROUP_PREFIX = 'group:';

/**
 * AND-join the request’s filter clauses into a Typesense `filter_by` string.
 *
 * Status defaults to valid-only when the request carries no explicit status, so
 * archived/invalid/gone registrations stay out of the listing unless asked for.
 */
function buildFilterBy(request: SearchRequest): string {
  const clauses: string[] = [];

  if (request.status.length > 0) {
    clauses.push(`status:[${request.status.map(escapeFilterValue).join(',')}]`);
  } else {
    clauses.push('status:=valid');
  }

  pushInClause(clauses, 'publisher', request.publisher);
  pushInClause(clauses, 'keyword', request.keyword);
  pushInClause(clauses, 'terminology_source', request.terminologySource);

  // Split format and class values: group tokens filter the `_group` companion
  // field, the rest filter the granular field.
  const { groups: formatGroups, values: formats } = splitGroupValues(
    request.format,
  );
  pushInClause(clauses, 'format', formats);
  pushInClause(clauses, 'format_group', formatGroups);

  const { groups: classGroups, values: classes } = splitGroupValues(
    request.class,
  );
  pushInClause(clauses, 'class', classes);
  pushInClause(clauses, 'class_group', classGroups);

  const sizeClause = buildSizeClause(request.size);
  if (sizeClause !== undefined) {
    clauses.push(sizeClause);
  }

  // `catalog` is a filter-only, non-facet (so tokenized) field, so it must use
  // the exact `:=` operator — a non-exact `catalog:[…]` would partial-match IRIs
  // on shared path segments.
  if (request.catalog.length > 0) {
    clauses.push(
      `catalog:=[${request.catalog.map(escapeFilterValue).join(',')}]`,
    );
  }

  return clauses.join(' && ');
}

/** Partition values into `group:*` tokens and everything else. */
function splitGroupValues(values: readonly string[]): {
  readonly groups: string[];
  readonly values: string[];
} {
  const groups: string[] = [];
  const granular: string[] = [];
  for (const value of values) {
    (value.startsWith(GROUP_PREFIX) ? groups : granular).push(value);
  }
  return { groups, values: granular };
}

/** Append a `field:[a,b,…]` membership clause when `values` is non-empty. */
function pushInClause(
  clauses: string[],
  field: string,
  values: readonly string[],
): void {
  if (values.length > 0) {
    clauses.push(`${field}:[${values.map(escapeFilterValue).join(',')}]`);
  }
}

/**
 * A Typesense range clause for the size filter: `size:[min..max]`, or only the
 * provided bound when one side is missing. Returns undefined when neither bound
 * is set.
 */
function buildSizeClause(size: SearchRequest['size']): string | undefined {
  const { min, max } = size;
  if (min !== undefined && max !== undefined) {
    return `size:[${min}..${max}]`;
  }
  if (min !== undefined) {
    return `size:>=${min}`;
  }
  if (max !== undefined) {
    return `size:<=${max}`;
  }
  return undefined;
}

/**
 * The `sort_by` for an order: newest-first by post date, or — for title order —
 * the active-locale folded title sort key, with status rank as the tie-breaker.
 * Falls back to the default sort field when neither applies.
 */
function buildSortBy(orderBy: OrderBy, locale: SearchLocale): string {
  if (orderBy === 'datePosted') {
    return 'date_posted:desc';
  }
  if (orderBy === 'title') {
    return `title_sort_${locale}:asc,status_rank:asc`;
  }
  return `${DEFAULT_SORTING_FIELD}:asc`;
}

/**
 * Backtick-wrap a Typesense filter value so reserved characters in IRIs and
 * media types (`:`, `/`, `&`, `,`, …) are taken literally instead of parsed as
 * filter syntax. An embedded backtick is escaped.
 */
function escapeFilterValue(value: string): string {
  return `\`${value.replace(/`/g, '\\`')}\``;
}

/** Map a Typesense search response onto the UI-agnostic {@link DatasetSearchResponse}. */
function parseSearchResponse(
  response: SearchResponse<SearchHitDocument>,
): DatasetSearchResponse {
  const documents = (response.hits ?? []).map((hit) => hit.document);

  const facetCounts: Record<string, FacetCount[]> = {};
  for (const facet of response.facet_counts ?? []) {
    facetCounts[facet.field_name as string] = facet.counts.map((bucket) => ({
      value: bucket.value,
      count: bucket.count,
    }));
  }

  return { documents, total: response.found, facetCounts };
}
