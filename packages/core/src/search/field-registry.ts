/**
 * The single declarative field registry for the dataset search index.
 *
 * One table maps every Typesense document field to its Typesense type and
 * search role. It is consumed by BOTH the search-indexer (collection-schema
 * builder + projector) and the browser query path (which fields to `query_by`
 * and with what weights), so the two cannot drift. Field types are written in
 * Typesense’s own vocabulary (`string`, `int32`, …) so the schema builder is a
 * direct mapping, yet this module stays free of any Typesense import — the
 * browser imports it at query time without pulling in the indexer’s engine deps.
 *
 * Folding (diacritic/case normalization of the `*_search` fields) is applied by
 * the projector and the query path via `@lde/text-normalization`, identically
 * on both sides. Weights and synonyms are query-time tuning and deliberately not
 * baked into the stored index (see {@link SEARCH_SYNONYMS}).
 */

export type SearchFieldType =
  | 'string'
  | 'string[]'
  | 'int32'
  | 'int64'
  | 'float'
  | 'bool';

/** Which pipeline owns a field’s values (Mode 2 multi-source composition). */
export type SearchFieldSource = 'register' | 'dkg';

export type SearchFieldRole =
  | 'searchable'
  | 'display'
  | 'facet'
  | 'sort'
  | 'meta';

export interface SearchFieldSpec {
  /** Typesense document field name. */
  readonly name: string;
  readonly type: SearchFieldType;
  /** Documents the field’s primary purpose; aids readers, not the schema. */
  readonly role: SearchFieldRole;
  /** Expose as a Typesense facet. */
  readonly facet?: boolean;
  /** Allow sorting / range filtering on this field. */
  readonly sort?: boolean;
  /** Field may be absent on a document. */
  readonly optional?: boolean;
  /**
   * Include in `query_by` with this weight (higher ranks higher). Presence of a
   * weight is what marks a field as full-text searchable. Title × 5, publisher
   * × 3, description/creator × 2, keyword × 1 (per #1684).
   */
  readonly weight?: number;
  /** Enable Snowball (Dutch) stemming. Only set on the folded `*_search` fields. */
  readonly stem?: boolean;
  /**
   * Typesense tokenizer/stemmer locale. Set to `nl` on the stemmed searchable
   * fields: the Snowball language is selected by locale, so Dutch stemming
   * (verhalen → verhaal) needs it. Safe alongside our pre-folding — the values
   * are already diacritic-free, so the locale has no diacritics to preserve.
   */
  readonly locale?: string;
  /**
   * Member of a per-locale family (`${base}_search_nl/_en`), eligible for
   * active-locale query-weight boosting — unlike a single-locale searchable
   * field such as the multilingual `keyword_search`.
   */
  readonly perLocale?: boolean;
  /** Do not index for search (display-only fields), saving memory. */
  readonly index?: boolean;
  /** The pipeline that writes this field. */
  readonly source: SearchFieldSource;
}

/** The locales projected per `langText` concept (display, search, sort). */
export const SEARCH_LOCALES = ['nl', 'en'] as const;

/** One of the projected search locales. */
export type SearchLocale = (typeof SEARCH_LOCALES)[number];

/**
 * A folded, stemmed search field per locale (`${base}_search_nl/_en`), each
 * stemmed in its own language. `@lde/search` emits these from one `locales`
 * list; the schema sets `stem` + `locale` per field so nl and en stem correctly.
 */
function perLocaleSearch(
  base: string,
  weight: number,
  options: { readonly optional?: boolean } = {},
): readonly SearchFieldSpec[] {
  return SEARCH_LOCALES.map((locale) => ({
    name: `${base}_search_${locale}`,
    type: 'string',
    role: 'searchable',
    weight,
    stem: true,
    locale,
    perLocale: true,
    optional: options.optional ?? false,
    source: 'register',
  }));
}

/**
 * The register (substrate-A) fields plus the DKG (substrate-B) fields. DKG
 * fields are declared from day one (so the collection schema is stable across
 * the enrichment rollout) but are optional and populated by the separate DKG
 * enrichment pipeline, not the register projector.
 */
export const SEARCH_FIELDS: readonly SearchFieldSpec[] = [
  // --- Searchable: folded, per-locale, stemmed in that locale. One field per
  //     language so nl and en are each stemmed correctly (one field has one
  //     `locale` hence one Snowball stemmer); the browser query_bys all of them
  //     and weights the active locale higher. ---
  // Optional like every per-locale field: a dataset titled in one language has
  // no `_search_` field for the other, so neither locale’s field can be required.
  ...perLocaleSearch('title', 5, { optional: true }),
  ...perLocaleSearch('publisher', 3, { optional: true }),
  ...perLocaleSearch('description', 2, { optional: true }),
  ...perLocaleSearch('creator', 2, { optional: true }),
  // Keyword is a faceted tag list, not language-tagged prose: one folded,
  // Dutch-stemmed search field (the facet’s `_search` array), not per-locale.
  {
    name: 'keyword_search',
    type: 'string[]',
    role: 'searchable',
    weight: 1,
    stem: true,
    locale: 'nl',
    optional: true,
    source: 'register',
  },

  // --- Per-locale display fields (title and description shown by locale).
  //     Publisher has no display field: the card resolves the publisher IRI to
  //     a label via the `labels` collection, exactly like a facet bucket. ---
  {
    name: 'title_nl',
    type: 'string',
    role: 'display',
    index: false,
    optional: true,
    source: 'register',
  },
  {
    name: 'title_en',
    type: 'string',
    role: 'display',
    index: false,
    optional: true,
    source: 'register',
  },
  {
    name: 'description_nl',
    type: 'string',
    role: 'display',
    index: false,
    optional: true,
    source: 'register',
  },
  {
    name: 'description_en',
    type: 'string',
    role: 'display',
    index: false,
    optional: true,
    source: 'register',
  },

  // --- Register facets (granular + grouped where the UI groups) ---
  {
    name: 'publisher',
    type: 'string[]',
    role: 'facet',
    facet: true,
    optional: true,
    source: 'register',
  },
  {
    // Filter-only: the browser filters datasets by catalog but never shows
    // catalog bucket counts, so it stays out of facets (`facet: false`). It is
    // still filterable — every indexed field is — but as a non-facet field it is
    // tokenized, so the catalog filter must use Typesense’s exact `:=` operator
    // (an IRI would otherwise partial-match on shared path segments).
    name: 'catalog',
    type: 'string[]',
    role: 'facet',
    facet: false,
    optional: true,
    source: 'register',
  },
  {
    name: 'keyword',
    type: 'string[]',
    role: 'facet',
    facet: true,
    optional: true,
    source: 'register',
  },
  {
    name: 'format',
    type: 'string[]',
    role: 'facet',
    facet: true,
    optional: true,
    source: 'register',
  },
  {
    name: 'format_group',
    type: 'string[]',
    role: 'facet',
    facet: true,
    optional: true,
    source: 'register',
  },
  {
    name: 'status',
    type: 'string',
    role: 'facet',
    facet: true,
    source: 'register',
  },
  {
    name: 'language',
    type: 'string[]',
    role: 'facet',
    facet: true,
    optional: true,
    source: 'register',
  },

  // --- Sort keys + pipeline metadata ---
  {
    name: 'status_rank',
    type: 'int32',
    role: 'sort',
    sort: true,
    source: 'register',
  },
  // Per-locale sort keys (folded), so browse-mode sorting follows the active
  // language instead of being frozen to one.
  {
    name: 'title_sort_nl',
    type: 'string',
    role: 'sort',
    sort: true,
    optional: true,
    source: 'register',
  },
  {
    name: 'title_sort_en',
    type: 'string',
    role: 'sort',
    sort: true,
    optional: true,
    source: 'register',
  },
  {
    name: 'date_posted',
    type: 'int64',
    role: 'sort',
    sort: true,
    optional: true,
    source: 'register',
  },

  // --- DKG enrichment (declared now, populated by the substrate-B pipeline) ---
  {
    name: 'class',
    type: 'string[]',
    role: 'facet',
    facet: true,
    optional: true,
    source: 'dkg',
  },
  {
    name: 'class_group',
    type: 'string[]',
    role: 'facet',
    facet: true,
    optional: true,
    source: 'dkg',
  },
  {
    name: 'terminology_source',
    type: 'string[]',
    role: 'facet',
    facet: true,
    optional: true,
    source: 'dkg',
  },
  {
    name: 'size',
    type: 'int64',
    role: 'facet',
    facet: true,
    sort: true,
    optional: true,
    source: 'dkg',
  },

  // --- NDE compatibility (“vinkjes”) booleans, computed at index time from DKG
  //     DQV quality measurements. Facet-ready (so the listing can offer them as
  //     filters) but not yet rendered as UI facets. A field is set to true only
  //     when the criterion is met (see compatibility.ts); omitted otherwise, so
  //     a faceted `field:=true` count is the number of compliant datasets. ---
  {
    // Display/count field (the declared IIIF manifest count), not a facet — like
    // `catalog`, it stays out of `facetFields()`; the card shows the number.
    name: 'iiif_manifest_count',
    type: 'int32',
    role: 'facet',
    facet: false,
    optional: true,
    source: 'dkg',
  },
  {
    // Working-IIIF gate: true only when the DKG validated the declared manifests
    // (or none were sampled yet). Facet-ready; the card shows the icon on this.
    name: 'iiif',
    type: 'bool',
    role: 'facet',
    facet: true,
    optional: true,
    source: 'dkg',
  },
  {
    name: 'nde_schema_ap',
    type: 'bool',
    role: 'facet',
    facet: true,
    optional: true,
    source: 'dkg',
  },
  {
    name: 'linked_data',
    type: 'bool',
    role: 'facet',
    facet: true,
    optional: true,
    source: 'dkg',
  },
  {
    name: 'terms',
    type: 'bool',
    role: 'facet',
    facet: true,
    optional: true,
    source: 'dkg',
  },
  {
    name: 'persistent_uris',
    type: 'bool',
    role: 'facet',
    facet: true,
    optional: true,
    source: 'dkg',
  },
];

/** The field Typesense sorts by when no text query orders the results. */
export const DEFAULT_SORTING_FIELD = 'status_rank';

/** Stable alias the browser queries; the live collection is versioned behind it. */
export const SEARCH_COLLECTION_ALIAS = 'datasets';

/**
 * Stable alias for the sidecar IRI → label collection (organizations, classes,
 * terminology sources). The browser resolves facet-bucket labels against it by
 * IRI; the live collection is versioned behind the alias and rebuilt blue/green
 * alongside {@link SEARCH_COLLECTION_ALIAS}.
 */
export const LABELS_COLLECTION_ALIAS = 'labels';

/** Stable, collection-independent synonym set (Typesense v30+ Synonym Sets API).
 *  Each versioned collection references it by name; its items are synced live
 *  each indexer run, so changing synonyms needs no reindex. */
export const SEARCH_SYNONYM_SET = 'dataset-register-synonyms';

/** A searchable field is one carrying a `query_by` weight. */
type WeightedField = SearchFieldSpec & { weight: number };

/** Full-text searchable fields, highest weight first. */
export function searchableFields(): readonly WeightedField[] {
  return SEARCH_FIELDS.filter(
    (field): field is WeightedField => field.weight !== undefined,
  ).sort((a, b) => b.weight - a.weight);
}

/** Comma-separated `query_by` value for a Typesense search. */
export function queryBy(): string {
  return searchableFields()
    .map((field) => field.name)
    .join(',');
}

/**
 * Comma-separated `query_by_weights`, aligned with {@link queryBy}. Given an
 * `activeLocale`, each per-locale search field (`*_search_<locale>`) keeps its
 * full weight for that locale and is gently demoted (−1, floored at 1) for the
 * other, so a match in the user’s language ranks higher while cross-language
 * matches still surface. Fields that are not split per locale — notably the
 * multilingual `keyword_search`, one mixed field rather than one per language —
 * keep their weight. Without an `activeLocale`, every field keeps its weight.
 */
export function queryByWeights(activeLocale?: SearchLocale): string {
  return searchableFields()
    .map((field) => String(weightForLocale(field, activeLocale)))
    .join(',');
}

/** Per-locale fields (flagged {@link SearchFieldSpec.perLocale}) get the active
 *  locale's full weight and the other locale's weight − 1 (floored at 1);
 *  every other field keeps its weight. */
function weightForLocale(
  field: WeightedField,
  activeLocale: SearchLocale | undefined,
): number {
  if (activeLocale === undefined || field.perLocale !== true) {
    return field.weight;
  }
  return field.locale === activeLocale
    ? field.weight
    : Math.max(1, field.weight - 1);
}

/** Facet field names. */
export function facetFields(): readonly string[] {
  return SEARCH_FIELDS.filter((field) => field.facet).map(
    (field) => field.name,
  );
}
