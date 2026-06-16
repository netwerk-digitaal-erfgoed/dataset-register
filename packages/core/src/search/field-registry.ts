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
  /** Do not index for search (display-only fields), saving memory. */
  readonly index?: boolean;
  /** The pipeline that writes this field. */
  readonly source: SearchFieldSource;
}

/**
 * The register (substrate-A) fields plus the DKG (substrate-B) fields. DKG
 * fields are declared from day one (so the collection schema is stable across
 * the enrichment rollout) but are optional and populated by the separate DKG
 * enrichment pipeline, not the register projector.
 */
export const SEARCH_FIELDS: readonly SearchFieldSpec[] = [
  // --- Searchable, folded, Dutch-stemmed (all language values per concept) ---
  {
    name: 'title_search',
    type: 'string',
    role: 'searchable',
    weight: 5,
    stem: true,
    locale: 'nl',
    source: 'register',
  },
  {
    name: 'publisher_search',
    type: 'string',
    role: 'searchable',
    weight: 3,
    stem: true,
    locale: 'nl',
    optional: true,
    source: 'register',
  },
  {
    name: 'description_search',
    type: 'string',
    role: 'searchable',
    weight: 2,
    stem: true,
    locale: 'nl',
    optional: true,
    source: 'register',
  },
  {
    name: 'creator_search',
    type: 'string',
    role: 'searchable',
    weight: 2,
    stem: true,
    locale: 'nl',
    optional: true,
    source: 'register',
  },
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

  // --- Per-locale display fields (locale drives display, not retrieval) ---
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
  {
    name: 'publisher_name',
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
  {
    name: 'title_sort',
    type: 'string',
    role: 'sort',
    sort: true,
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

/** Comma-separated `query_by_weights`, aligned with {@link queryBy}. */
export function queryByWeights(): string {
  return searchableFields()
    .map((field) => String(field.weight))
    .join(',');
}

/** Facet field names. */
export function facetFields(): readonly string[] {
  return SEARCH_FIELDS.filter((field) => field.facet).map(
    (field) => field.name,
  );
}
