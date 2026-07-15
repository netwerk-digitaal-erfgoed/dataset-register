import type { OrderBy, SearchRequest } from '../datasets.js';
import { queryGraphQL } from './client.js';

/** The active UI locale, the locales the index carries per-locale fields for. */
export type SearchLocale = 'nl' | 'en';

/** A best-first localized value from the GraphQL API: `[0]` is the language
 *  actually served for the request’s `Accept-Language`. */
export interface LanguageString {
  readonly language: string | null;
  readonly value: string;
}

/** A resolved reference on a hit or facet bucket: its IRI and localized label. */
export interface DatasetReference {
  readonly id: string;
  readonly name: readonly LanguageString[];
}

/** One dataset hit, as the GraphQL `Dataset` output type projects it. */
export interface DatasetItem {
  readonly id: string;
  readonly title: readonly LanguageString[];
  readonly description: readonly LanguageString[];
  readonly language: readonly string[];
  readonly publisher: readonly DatasetReference[];
  readonly status: string;
  readonly size: number | null;
  readonly date_posted: string | null;
  readonly format: readonly string[];
  readonly iiif: boolean | null;
  readonly iiif_manifest_count: number | null;
  readonly nde_schema_ap: boolean | null;
}

/** A value facet bucket: its raw value (a token or IRI), count and
 *  (for reference facets) resolved label. `label` is absent for the token
 *  facets whose display the browser owns – the query does not select it, so the
 *  GraphQL response omits the field entirely (not `null`). */
export interface ValueBucket {
  readonly value: string;
  readonly count: number;
  readonly label?: readonly LanguageString[] | null;
}

/** A range facet bucket: its count and half-open `[min, max)` bounds (`max` null
 *  on the open-ended top bin). The bin is identified by its bounds, not a key. */
export interface RangeBucket {
  readonly count: number;
  readonly min: number | null;
  readonly max: number | null;
}

/** The facet buckets the sidebar renders, keyed by GraphQL facet field name. */
export interface RawFacets {
  readonly publisher: readonly ValueBucket[];
  readonly format: readonly ValueBucket[];
  readonly class: readonly ValueBucket[];
  readonly terminology_source: readonly ValueBucket[];
  readonly status: readonly ValueBucket[];
  readonly size: readonly RangeBucket[];
}

/** The parsed result of a dataset search: the matched items, the total match
 *  count for paging, and the facet buckets. Items and facets come back in one
 *  GraphQL request (the API computes each facet with its own filter removed). */
export interface DatasetSearchResult {
  readonly total: number;
  readonly items: readonly DatasetItem[];
  readonly facets: RawFacets;
}

/** Paging, ordering, and locale for a {@link runDatasetSearch} call. */
export interface SearchOptions {
  readonly limit: number;
  readonly offset: number;
  readonly orderBy: OrderBy;
  readonly locale: SearchLocale;
}

/** A GraphQL `where` clause per filterable field; membership (`in`) for the
 *  token/reference facets, an inclusive `range` for size. */
interface DatasetWhere {
  status?: { in: readonly string[] };
  publisher?: { in: readonly string[] };
  format?: { in: readonly string[] };
  class?: { in: readonly string[] };
  terminology_source?: { in: readonly string[] };
  catalog?: { in: readonly string[] };
  size?: { min?: number; max?: number };
}

interface DatasetOrderBy {
  readonly field: 'RELEVANCE' | 'TITLE' | 'DATE_POSTED';
  readonly direction: 'ASC' | 'DESC';
}

/**
 * Run a dataset search against the GraphQL API and return the matched items,
 * total, and facet buckets. `fetchImpl` is injected so a server-side caller (the
 * RSS feed) can pass SvelteKit’s `event.fetch`; the browser omits it.
 */
export async function runDatasetSearch(
  request: SearchRequest,
  options: SearchOptions,
  deps: { readonly fetchImpl?: typeof fetch } = {},
): Promise<DatasetSearchResult> {
  const { limit, offset, orderBy, locale } = options;
  const text =
    request.query !== undefined && request.query.length > 0
      ? request.query
      : undefined;
  const variables = {
    query: text,
    where: buildWhere(request),
    orderBy: buildOrderBy(orderBy, text !== undefined),
    page: Math.floor(offset / limit) + 1,
    perPage: limit,
  };
  const data = await queryGraphQL<{ datasets: DatasetSearchResult }>(
    DATASET_SEARCH_QUERY,
    variables,
    { locale, fetchImpl: deps.fetchImpl },
  );
  return data.datasets;
}

/**
 * A `{nl, en}` display record from a best-first localized value, keyed by
 * language code (an untagged value keys `''`), dropping empty values. Returns
 * undefined when nothing remains, so optional text and unresolved references
 * (a `null` label) or unselected ones (an absent, `undefined` label on a
 * token facet) stay absent. Shared by the card and facet mappers.
 */
export function localizedRecord(
  values: readonly LanguageString[] | null | undefined,
): Record<string, string> | undefined {
  if (values === null || values === undefined) {
    return undefined;
  }
  const record: Record<string, string> = {};
  for (const { language, value } of values) {
    if (value.length > 0) {
      record[language ?? ''] = value;
    }
  }
  return Object.keys(record).length > 0 ? record : undefined;
}

/**
 * The GraphQL `where` for a request: one membership clause per active facet plus
 * the size range. Format and class each carry both granular values and `group:*`
 * tokens in a single field, so a mixed selection unions naturally in one `in`
 * (no companion-field OR). Status is omitted when unset – the API’s
 * `queryDefaults` then applies the valid-only default.
 */
export function buildWhere(request: SearchRequest): DatasetWhere {
  const where: DatasetWhere = {};
  if (request.status.length > 0) {
    where.status = { in: request.status };
  }
  if (request.publisher.length > 0) {
    where.publisher = { in: request.publisher };
  }
  if (request.format.length > 0) {
    where.format = { in: request.format };
  }
  if (request.class.length > 0) {
    where.class = { in: request.class };
  }
  if (request.terminologySource.length > 0) {
    where.terminology_source = { in: request.terminologySource };
  }
  if (request.catalog.length > 0) {
    where.catalog = { in: request.catalog };
  }
  const { min, max } = request.size;
  if (min !== undefined || max !== undefined) {
    where.size = {
      ...(min !== undefined ? { min } : {}),
      ...(max !== undefined ? { max } : {}),
    };
  }
  return where;
}

/**
 * The `orderBy` for a request. An explicit date order always wins (newest
 * first). A text query then ranks by relevance; browse mode (no query) sorts by
 * title. The previous status-rank tie-break is dropped – the GraphQL `orderBy` is
 * a single dimension – so it no longer nudges valid datasets above the rest
 * within an equal relevance/title (a minor ordering change, invisible under the
 * default valid-only filter).
 */
export function buildOrderBy(
  orderBy: OrderBy,
  hasQuery: boolean,
): DatasetOrderBy {
  if (orderBy === 'datePosted') {
    return { field: 'DATE_POSTED', direction: 'DESC' };
  }
  if (hasQuery) {
    return { field: 'RELEVANCE', direction: 'DESC' };
  }
  return { field: 'TITLE', direction: 'ASC' };
}

/** One request returns the listing page, the total, and every sidebar facet;
 *  reference facets and hit references carry their engine-resolved labels.
 *  Exported so a test can validate it against the generated GraphQL schema,
 *  guarding against the query and the contract drifting apart. */
export const DATASET_SEARCH_QUERY = `
  query Datasets(
    $query: String
    $where: DatasetWhere
    $orderBy: DatasetOrderBy
    $page: Int
    $perPage: Int
  ) {
    datasets(
      query: $query
      where: $where
      orderBy: $orderBy
      page: $page
      perPage: $perPage
    ) {
      total
      items {
        id
        title { language value }
        description { language value }
        language
        publisher { id name { language value } }
        status
        size
        date_posted
        format
        iiif
        iiif_manifest_count
        nde_schema_ap
      }
      facets {
        publisher { value count label { language value } }
        format { value count }
        class { value count label { language value } }
        terminology_source { value count label { language value } }
        status { value count }
        size { count min max }
      }
    }
  }
`;
