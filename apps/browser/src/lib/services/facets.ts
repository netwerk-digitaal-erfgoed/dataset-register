import { getLocalizedValue } from '$lib/utils/i18n';
import { shortenUri } from '$lib/utils/prefix';
import * as m from '$lib/paraglide/messages';
import {
  CHECK_SCHEMA_AP_NDE,
  localizedRecord,
  type RangeBucket,
  type RawFacets,
  type ValueBucket,
} from './search/datasets.js';
import {
  FORMAT_GROUP_RDF,
  FORMAT_GROUP_SPARQL,
} from '@dataset-register/core/search';

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
 * facets; format/status/group facets leave it unset and rely on the value
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

// The status facet offers only the non-default states as toggles: `valid` is the
// implicit default (no selection), so it is never shown as a togglable value.
const SELECTABLE_STATUSES: ReadonlySet<string> = new Set([
  VALUE_INVALID,
  VALUE_GONE,
]);

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
  | 'format'
  | 'class'
  | 'terminologySource'
  | 'status'
  | 'checks'
  | 'catalog'
  | 'size';

export type Facets = {
  publisher: CountedFacetValue[];
  format: CountedFacetValue[];
  class: CountedFacetValue[];
  terminologySource: CountedFacetValue[];
  status: CountedFacetValue[];
  checks: CountedFacetValue[];
  size: Histogram;
};

// The fallback size range when a histogram is unavailable or the search failed.
const SIZE_RANGE_FALLBACK: FacetValueRange = { min: 1, max: 1000000000 };

/**
 * Map the GraphQL facet buckets onto the sidebar {@link Facets} shape. Every
 * sidebar facet comes back in the one listing query (the API computes each with
 * its own filter removed – skip-own-filter – server-side), and reference facets
 * arrive with their labels already resolved, so this is a pure reshape: no
 * per-facet round-trip and no client-side label lookup.
 */
export function mapFacets(facets: RawFacets): Facets {
  return {
    publisher: mapValueBuckets(facets.publisher),
    format: mapValueBuckets(facets.format),
    class: mapValueBuckets(facets.class),
    terminologySource: mapValueBuckets(facets.terminology_source),
    // The status facet lists only the non-default states (invalid, gone);
    // `valid` is the implicit default and is never a toggle.
    status: mapValueBuckets(
      facets.status.filter((bucket) => SELECTABLE_STATUSES.has(bucket.value)),
    ),
    checks: mapCheckBuckets(facets),
    size: mapSizeHistogram(facets.size),
  };
}

/** Empty facets for the not-configured / failed-search fallback. */
export function emptyFacets(): Facets {
  return {
    publisher: [],
    format: [],
    class: [],
    terminologySource: [],
    status: [],
    checks: [],
    size: { range: SIZE_RANGE_FALLBACK, bins: [] },
  };
}

// Fold the index’s boolean check facets into the single “automated checks”
// facet: one value per check, counting the datasets that pass it. The fields are
// indexed only when the check is met, so only the `true` bucket carries a
// meaningful count; a check nothing passes yields no bucket and is left out.
function mapCheckBuckets(facets: RawFacets): CountedFacetValue[] {
  const checks: CountedFacetValue[] = [];
  for (const [check, buckets] of [
    [CHECK_SCHEMA_AP_NDE, facets.nde_schema_ap],
  ] as const) {
    const count = buckets.find((bucket) => bucket.value === 'true')?.count ?? 0;
    if (count > 0) {
      checks.push({ value: check, count });
    }
  }
  return checks;
}

// Map value/reference facet buckets to counted values, attaching the resolved
// label (reference facets) and sorting highest count first, then by value –
// matching the previous SPARQL ORDER BY.
function mapValueBuckets(buckets: readonly ValueBucket[]): CountedFacetValue[] {
  return buckets
    .map((bucket) => {
      const label = localizedRecord(bucket.label);
      return label === undefined
        ? { value: bucket.value, count: bucket.count }
        : { value: bucket.value, count: bucket.count, label };
    })
    .sort(
      (left, right) =>
        right.count - left.count || left.value.localeCompare(right.value),
    );
}

// Map the size range buckets to the UI histogram. The bins are logarithmic
// (bin n starts at 10^n), so the bin index is log10 of the bucket’s lower bound;
// the slider range is derived from the same populated bins (or the fallback).
function mapSizeHistogram(buckets: readonly RangeBucket[]): Histogram {
  const populated = buckets.filter((bucket) => bucket.count > 0);

  const bins: HistogramBin[] = populated
    .filter((bucket) => bucket.min !== null && bucket.min > 0)
    .map((bucket) => ({
      bin: Math.round(Math.log10(bucket.min as number)),
      count: bucket.count,
    }))
    .filter((bin) => Number.isFinite(bin.bin))
    .sort((left, right) => left.bin - right.bin);

  const range: FacetValueRange =
    populated.length > 0
      ? {
          min: Math.min(
            ...populated.map((bucket) => bucket.min ?? SIZE_RANGE_FALLBACK.min),
          ),
          max: Math.max(
            ...populated.map((bucket) => bucket.max ?? SIZE_RANGE_FALLBACK.max),
          ),
        }
      : SIZE_RANGE_FALLBACK;

  return { range, bins };
}

const valueTranslations = {
  [VALUE_GONE]: m['facets_status_gone'],
  [VALUE_INVALID]: m['facets_status_invalid'],
  [FORMAT_GROUP_RDF]: m['group:rdf'],
  [FORMAT_GROUP_SPARQL]: m['group:sparql'],
  [GROUP_PERSON]: m['group:person'],
  [GROUP_ORGANIZATION]: m['group:organization'],
  [GROUP_MEDIA]: m['group:media'],
  [GROUP_CONCEPT]: m['group:concept'],
  [GROUP_CREATIVE_WORK]: m['group:creative-work'],
  [GROUP_PLACE]: m['group:place'],
  [GROUP_DATE]: m['group:date'],
  [GROUP_PROVENANCE]: m['group:provenance'],
  [GROUP_EVENT]: m['group:event'],
  [CHECK_SCHEMA_AP_NDE]: m['facets_checks_schema_ap_nde'],
};

const valueTooltips = {
  [VALUE_GONE]: m['facets_status_gone_tooltip'],
  [VALUE_INVALID]: m['facets_status_invalid_tooltip'],
  [CHECK_SCHEMA_AP_NDE]: m['facets_checks_schema_ap_nde_tooltip'],
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
