import type {
  SearchParams,
  SearchResponse,
} from 'typesense/lib/Typesense/Documents.js';
import {
  DEFAULT_SORTING_FIELD,
  GROUP_PREFIX,
  SEARCH_COLLECTION_ALIAS,
  queryBy,
  queryByWeights,
} from '@dataset-register/core/search';
import { fold } from '@lde/text-normalization';
import type { OrderBy, SearchRequest } from '../datasets.js';
import { searchCollection } from './client.js';

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
  /**
   * Apply the default `status:=valid` filter when no status is selected
   * (default true). Set false when computing the status facet itself, so it
   * counts across all statuses instead of only the valid ones.
   */
  readonly includeDefaultStatus?: boolean;
}

/**
 * Run a dataset search against the Typesense `datasets` collection and parse the
 * response into a UI-agnostic shape. The searcher is injected so the function is
 * unit-testable against a mock; it defaults to the direct `fetch`-based
 * {@link searchCollection}. This is the seam a later GraphQL-backed
 * implementation slots into without touching the UI.
 */
export async function searchDatasets(
  request: SearchRequest,
  options: SearchOptions,
  search: (
    collection: string,
    params: Record<string, unknown>,
  ) => Promise<SearchResponse<SearchHitDocument>> = searchCollection,
): Promise<DatasetSearchResponse> {
  const response = await search(
    SEARCH_COLLECTION_ALIAS,
    // Typesense `SearchParams` is a well-known-property object with no index
    // signature, so widen it to the searcher’s `Record<string, unknown>`.
    buildSearchParams(request, options) as Record<string, unknown>,
  );
  return parseSearchResponse(response);
}

/**
 * Build the Typesense {@link SearchParams} for a request. Pure (no client, no
 * env), so the query mapping – `q` folding, `query_by`/weights, `filter_by`
 * clauses, `sort_by` – is asserted directly in tests. The listing does not
 * request facets (`fetchFacets` runs its own faceted searches), so no `facet_by`.
 */
export function buildSearchParams(
  request: SearchRequest,
  options: SearchOptions,
): SearchParams<SearchHitDocument> {
  const { limit, offset, orderBy, locale } = options;
  // Folded query text, or undefined when browsing (no query). Drives both the
  // `q` match-all sentinel and the relevance-vs-alphabetical sort choice.
  const foldedQuery =
    request.query !== undefined && request.query.length > 0
      ? fold(request.query)
      : undefined;
  return {
    q: foldedQuery ?? '*',
    query_by: queryBy(),
    query_by_weights: queryByWeights(locale),
    per_page: limit,
    page: Math.floor(offset / limit) + 1,
    filter_by: buildFilterBy(request, options.includeDefaultStatus ?? true),
    sort_by: buildSortBy(orderBy, locale, foldedQuery !== undefined),
  };
}

// Group tokens (`group:rdf`/`group:sparql` for format, `group:*` for class)
// select against the index’s `_group` companion field rather than the granular
// field; everything else is a granular value (a media type or a class IRI).

/**
 * AND-join the request’s filter clauses into a Typesense `filter_by` string.
 *
 * Status defaults to valid-only when the request carries no explicit status, so
 * archived/invalid/gone registrations stay out of the listing unless asked for.
 */
function buildFilterBy(
  request: SearchRequest,
  includeDefaultStatus: boolean,
): string {
  const clauses: string[] = [];

  if (request.status.length > 0) {
    clauses.push(`status:[${request.status.map(escapeFilterValue).join(',')}]`);
  } else if (includeDefaultStatus) {
    clauses.push('status:=valid');
  }

  pushInClause(clauses, 'publisher', request.publisher);
  pushInClause(clauses, 'keyword', request.keyword);
  pushInClause(clauses, 'terminology_source', request.terminologySource);

  // Format and class each mix granular values with `group:*` tokens (a coarser
  // view of the same field, e.g. group:rdf covers the RDF media types). Within
  // one facet the selections must UNION, so OR the granular field with its
  // `_group` companion rather than AND-ing two separate clauses – otherwise
  // ticking a value and a group in the same facet intersects to (near) nothing.
  pushGroupedClause(clauses, 'format', 'format_group', request.format);
  pushGroupedClause(clauses, 'class', 'class_group', request.class);

  const sizeClause = buildSizeClause(request.size);
  if (sizeClause !== undefined) {
    clauses.push(sizeClause);
  }

  // `catalog` is a filter-only, non-facet (so tokenized) field, so it must use
  // the exact `:=` operator – a non-exact `catalog:[…]` would partial-match IRIs
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
 * Append a facet clause that ORs the granular field with its `_group` companion
 * – `(format:[…] || format_group:[…])` – so selecting a value and a group token
 * within one facet unions instead of intersecting. Emits a single unparenthesized
 * clause when only one side is present, and nothing when the facet is empty.
 */
function pushGroupedClause(
  clauses: string[],
  field: string,
  groupField: string,
  values: readonly string[],
): void {
  const { groups, values: granular } = splitGroupValues(values);
  const parts: string[] = [];
  if (granular.length > 0) {
    parts.push(`${field}:[${granular.map(escapeFilterValue).join(',')}]`);
  }
  if (groups.length > 0) {
    parts.push(`${groupField}:[${groups.map(escapeFilterValue).join(',')}]`);
  }
  if (parts.length === 1) {
    clauses.push(parts[0]!);
  } else if (parts.length === 2) {
    clauses.push(`(${parts.join(' || ')})`);
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
 * The `sort_by` for a request. An explicit date order always wins (newest
 * first), so date sorting is honoured even while searching. A text query then
 * ranks by Typesense relevance (`_text_match`, fed by the per-field
 * `query_by_weights`) with status rank as the tie-breaker – without an explicit
 * `_text_match` sort those weights would not affect result order at all. Browse
 * mode (no query) sorts by the active-locale folded title key, falling back to
 * the default sort field.
 */
function buildSortBy(
  orderBy: OrderBy,
  locale: SearchLocale,
  hasQuery: boolean,
): string {
  if (orderBy === 'datePosted') {
    return 'date_posted:desc';
  }
  if (hasQuery) {
    return `_text_match:desc,status_rank:asc`;
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
