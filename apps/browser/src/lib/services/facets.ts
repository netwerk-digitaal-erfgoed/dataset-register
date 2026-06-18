import type { SearchParams } from 'typesense/lib/Typesense/Documents.js';
import { getLocalizedValue } from '$lib/utils/i18n';
import { shortenUri } from '$lib/utils/prefix';
import * as m from '$lib/paraglide/messages';
import { getLocale } from '$lib/paraglide/runtime';
import {
  buildSearchParams,
  type SearchHitDocument,
  type SearchLocale,
} from './search/datasets.js';
import {
  isSearchConfigured,
  labelResolver,
  searchClient,
} from './search/client.js';
import type { SearchRequest } from './datasets.js';
import { SEARCH_COLLECTION_ALIAS } from '@dataset-register/core';

/**
 * A facet value selected by the user.
 */
export interface SelectedFacetValue {
  value: string;
  label?: Record<string, string>;
}

export type FacetValueOptions = string[];

export type SelectedFacetValues = FacetValueOptions | FacetValueRange;

/**
 * A facet with counts for each value based on the current search query.
 *
 * `label` carries the per-locale display labels (`{nl, en}`) for IRI-valued
 * facets; keyword/status/group facets leave it unset and rely on the value
 * itself or {@link facetDisplayValue}’s translation table.
 */
export interface CountedFacetValue {
  value: string;
  label?: Record<string, string>;
  count: number;
}

export interface Histogram {
  range: FacetValueRange;
  bins: HistogramBin[];
}

export interface FacetValueRange {
  min: number;
  max: number;
}

export interface HistogramBin {
  bin: number;
  count: number;
}

const VALUE_INVALID = 'invalid';
const VALUE_GONE = 'gone';

const GROUP_RDF = 'group:rdf';
const GROUP_SPARQL = 'group:sparql';

// Class groups
const GROUP_PERSON = 'group:person';
const GROUP_ORGANIZATION = 'group:organization';
const GROUP_MEDIA = 'group:media';
const GROUP_CONCEPT = 'group:concept';
const GROUP_CREATIVE_WORK = 'group:creative-work';
const GROUP_PLACE = 'group:place';
const GROUP_DATE = 'group:date';
const GROUP_PROVENANCE = 'group:provenance';
const GROUP_EVENT = 'group:event';

/**
 * The sidebar facet keys, plus the special `size` histogram and the filter-only
 * `catalog` (never shown in the sidebar). Mirrors the previous SPARQL facet
 * config keys so the route and components keep the same `FacetKey` contract.
 */
export type FacetKey =
  | 'publisher'
  | 'keyword'
  | 'format'
  | 'class'
  | 'terminologySource'
  | 'status'
  | 'catalog'
  | 'size';

export type Facets = {
  publisher: CountedFacetValue[];
  keyword: CountedFacetValue[];
  format: CountedFacetValue[];
  class: CountedFacetValue[];
  terminologySource: CountedFacetValue[];
  status: CountedFacetValue[];
  size: Histogram;
};

// Which Typesense index field(s) back each sidebar facet, and whether its bucket
// values are IRIs (so their labels are resolved against the `labels` collection).
// `format` and `class` carry a companion `_group` field whose `group:*` buckets
// are merged into the same UI facet.
interface SidebarFacetSpec {
  readonly fields: readonly string[];
  readonly iri: boolean;
}

const SIDEBAR_FACETS: Record<
  Exclude<FacetKey, 'size' | 'catalog'>,
  SidebarFacetSpec
> = {
  publisher: { fields: ['publisher'], iri: true },
  keyword: { fields: ['keyword'], iri: false },
  format: { fields: ['format', 'format_group'], iri: false },
  class: { fields: ['class', 'class_group'], iri: true },
  terminologySource: { fields: ['terminology_source'], iri: true },
  status: { fields: ['status'], iri: false },
};

// The active filter for each sidebar facet, used to build `filter_by` with that
// facet’s own selection removed (so a multi-select facet still lists its other
// options — mirroring the previous skip-own-filter behaviour).
const FACET_REQUEST_KEY: Record<
  Exclude<FacetKey, 'size' | 'catalog'>,
  keyof SearchRequest
> = {
  publisher: 'publisher',
  keyword: 'keyword',
  format: 'format',
  class: 'class',
  terminologySource: 'terminologySource',
  status: 'status',
};

// How many buckets Typesense should return per facet. The previous SPARQL path
// returned every value; the UI folds long lists behind a search box, so a high
// ceiling preserves that affordance without unbounded payloads.
const MAX_FACET_VALUES = 250;

// Logarithmic size bins matching the UI’s `getBinLabel`/slider: bin n covers
// [10^n, 10^(n+1)), with bin 9 catching everything ≥ 1e9.
const SIZE_BIN_COUNT = 10;

/**
 * Compute every sidebar facet (and the size histogram) from Typesense, returning
 * the same {@link Facets} shape the SPARQL path produced. Each facet runs its own
 * search faceted on its field(s) with its own selection removed from the filter,
 * so a selected multi-select facet still lists its other options. All requests
 * run in parallel.
 */
export async function fetchFacets(
  searchFilters: SearchRequest,
): Promise<Facets> {
  if (!isSearchConfigured()) {
    return emptyFacets();
  }

  const locale = getLocale() as SearchLocale;
  const facetKeys = Object.keys(SIDEBAR_FACETS) as Array<
    Exclude<FacetKey, 'size' | 'catalog'>
  >;

  const [facetEntries, size] = await Promise.all([
    Promise.all(
      facetKeys.map(
        async (key) =>
          [key, await fetchSidebarFacet(key, searchFilters, locale)] as const,
      ),
    ),
    fetchSizeHistogram(searchFilters),
  ]);

  return {
    ...(Object.fromEntries(facetEntries) as Omit<Facets, 'size'>),
    size,
  };
}

// One sidebar facet’s buckets. Runs a per_page:0 search faceted on the facet’s
// field(s), filtered by the active filters minus this facet’s own selection, then
// merges multi-field buckets (format/class group companions) and resolves IRI
// labels for both locales (cheap: the labels collection is cached).
async function fetchSidebarFacet(
  key: Exclude<FacetKey, 'size' | 'catalog'>,
  searchFilters: SearchRequest,
  locale: SearchLocale,
): Promise<CountedFacetValue[]> {
  const spec = SIDEBAR_FACETS[key];
  const filtersExcludingFacet = {
    ...searchFilters,
    [FACET_REQUEST_KEY[key]]: [],
  };

  const parameters: SearchParams<SearchHitDocument> = {
    ...buildSearchParams(filtersExcludingFacet, {
      limit: 1,
      offset: 0,
      orderBy: 'title',
      locale,
    }),
    per_page: 0,
    facet_by: spec.fields.join(','),
    max_facet_values: MAX_FACET_VALUES,
  };

  try {
    const response = await searchClient()
      .collections<SearchHitDocument>(SEARCH_COLLECTION_ALIAS)
      .documents()
      .search(parameters, {});

    const buckets = (response.facet_counts ?? [])
      .filter((facet) => spec.fields.includes(facet.field_name as string))
      .flatMap((facet) => facet.counts);

    // Merge buckets that share a value (e.g. a granular field and its group
    // companion never collide, but keep the merge robust) by summing counts.
    const byValue = new Map<string, number>();
    for (const bucket of buckets) {
      byValue.set(
        bucket.value,
        (byValue.get(bucket.value) ?? 0) + bucket.count,
      );
    }

    const values: CountedFacetValue[] = [...byValue.entries()].map(
      ([value, count]) => ({ value, count }),
    );

    if (spec.iri) {
      await attachIriLabels(values);
    }

    // Highest count first, then by value, matching the SPARQL ORDER BY.
    values.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
    return values;
  } catch (error) {
    console.error(`Facet query failed for "${key}":`, error);
    return [];
  }
}

// Resolve the IRI buckets’ labels for both locales over the cached labels
// collection, attaching a `{nl, en}` label to each value that has one.
async function attachIriLabels(values: CountedFacetValue[]): Promise<void> {
  const iris = values.map((value) => value.value);
  const resolver = labelResolver();
  const [labelsNl, labelsEn] = await Promise.all([
    resolver.resolve(iris, 'nl'),
    resolver.resolve(iris, 'en'),
  ]);

  for (const value of values) {
    const nl = labelsNl.get(value.value);
    const en = labelsEn.get(value.value);
    if (nl !== undefined || en !== undefined) {
      const label: Record<string, string> = {};
      if (nl !== undefined) label.nl = nl;
      if (en !== undefined) label.en = en;
      value.label = label;
    }
  }
}

/**
 * The size histogram: the global {min, max} of the `size` field plus the
 * per-bin counts, in one faceted search. Typesense reports a numeric facet’s
 * stats (min/max) alongside the labelled range buckets, so a single request
 * yields both. Applies the current filters but excludes the size filter, so the
 * histogram shows the full distribution of otherwise-matching datasets.
 */
async function fetchSizeHistogram(
  searchFilters: SearchRequest,
): Promise<Histogram> {
  const fallback: Histogram = { range: { min: 1, max: 1000000000 }, bins: [] };
  if (!isSearchConfigured()) {
    return fallback;
  }

  const filtersWithoutSize = {
    ...searchFilters,
    size: { min: undefined, max: undefined },
  };

  const parameters: SearchParams<SearchHitDocument> = {
    ...buildSearchParams(filtersWithoutSize, {
      limit: 1,
      offset: 0,
      orderBy: 'title',
      locale: getLocale() as SearchLocale,
    }),
    per_page: 0,
    facet_by: sizeFacetBy(),
    max_facet_values: SIZE_BIN_COUNT,
  };

  try {
    const response = await searchClient()
      .collections<SearchHitDocument>(SEARCH_COLLECTION_ALIAS)
      .documents()
      .search(parameters, {});

    const sizeFacet = (response.facet_counts ?? []).find(
      (facet) => (facet.field_name as string) === 'size',
    );

    const bins: HistogramBin[] = (sizeFacet?.counts ?? [])
      .map((bucket) => ({
        bin: parseInt(bucket.value, 10),
        count: bucket.count,
      }))
      .filter((bin) => !Number.isNaN(bin.bin) && bin.count > 0)
      .sort((a, b) => a.bin - b.bin);

    // Typesense reports min/max in the numeric facet’s stats.
    const stats = (sizeFacet as { stats?: { min?: number; max?: number } })
      ?.stats;
    const range: FacetValueRange =
      stats?.min !== undefined && stats?.max !== undefined
        ? { min: Math.round(stats.min), max: Math.round(stats.max) }
        : fallback.range;

    return { range, bins };
  } catch (error) {
    console.error('Size histogram query failed:', error);
    return fallback;
  }
}

// The `facet_by` range definition that bins `size` into the UI’s logarithmic
// buckets. Each range is labelled with its bin index (`0`..`9`); start inclusive,
// end exclusive, with the last bin open-ended (≥ 1e9).
function sizeFacetBy(): string {
  const ranges: string[] = [];
  for (let bin = 0; bin < SIZE_BIN_COUNT; bin++) {
    const start = Math.pow(10, bin);
    if (bin === SIZE_BIN_COUNT - 1) {
      ranges.push(`${bin}:[${start}, ]`);
    } else {
      const end = Math.pow(10, bin + 1);
      ranges.push(`${bin}:[${start}, ${end}]`);
    }
  }
  return `size(${ranges.join(', ')})`;
}

function emptyFacets(): Facets {
  return {
    publisher: [],
    keyword: [],
    format: [],
    class: [],
    terminologySource: [],
    status: [],
    size: { range: { min: 1, max: 1000000000 }, bins: [] },
  };
}

const valueTranslations = {
  [VALUE_GONE]: m['facets_status_gone'],
  [VALUE_INVALID]: m['facets_status_invalid'],
  [GROUP_RDF]: m['group:rdf'],
  [GROUP_SPARQL]: m['group:sparql'],
  [GROUP_PERSON]: m['group:person'],
  [GROUP_ORGANIZATION]: m['group:organization'],
  [GROUP_MEDIA]: m['group:media'],
  [GROUP_CONCEPT]: m['group:concept'],
  [GROUP_CREATIVE_WORK]: m['group:creative-work'],
  [GROUP_PLACE]: m['group:place'],
  [GROUP_DATE]: m['group:date'],
  [GROUP_PROVENANCE]: m['group:provenance'],
  [GROUP_EVENT]: m['group:event'],
};

const valueTooltips = {
  [VALUE_GONE]: m['facets_status_gone_tooltip'],
  [VALUE_INVALID]: m['facets_status_invalid_tooltip'],
};

export function facetValueTooltip(
  facetValue: SelectedFacetValue,
): string | undefined {
  return valueTooltips[facetValue.value as keyof typeof valueTooltips]?.();
}

export function facetDisplayValue(facetValue: SelectedFacetValue) {
  const translated =
    valueTranslations[facetValue.value as keyof typeof valueTranslations]?.();
  if (translated) return translated;

  const label = getLocalizedValue(facetValue.label);
  if (label && !label.startsWith('http://') && !label.startsWith('https://')) {
    return label;
  }

  return shortenUri(facetValue.value);
}

export function formatNumber(num: number, locale = 'en'): string {
  const formatter = new Intl.NumberFormat(locale, {
    notation: 'compact',
    compactDisplay: 'short',
  });
  return formatter.format(num);
}
