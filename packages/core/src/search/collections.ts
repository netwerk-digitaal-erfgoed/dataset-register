/**
 * Collection aliases, locales, and index-wide constants shared by the search
 * indexer and the browser query path.
 *
 * This module carries no `@lde/search` (or Typesense) import, so the browser can
 * pull these constants at query time without dragging the schema’s indexer/engine
 * dependencies – and, transitively, node built-ins – into the client bundle. The
 * field model itself lives in {@link ./schema.ts}, which imports {@link SEARCH_LOCALES}
 * from here.
 */

/** The locales projected per `langText` concept (display, search, sort). */
export const SEARCH_LOCALES = ['nl', 'en'] as const;

/** One of the projected search locales. */
export type SearchLocale = (typeof SEARCH_LOCALES)[number];

/** The field Typesense sorts by when no text query orders the results. */
export const DEFAULT_SORTING_FIELD = 'status_rank';

/** Stable alias the query API searches; the live collection is versioned behind it. */
export const SEARCH_COLLECTION_ALIAS = 'datasets';

/**
 * Stable aliases for the typed label-source collections (ADR 0008): one per
 * `labelSource` `SearchType`, so the engine resolves each reference field’s
 * display label from its own collection by IRI. Each is rebuilt blue/green
 * alongside {@link SEARCH_COLLECTION_ALIAS}, versioned behind the alias.
 */
export const ORGANIZATION_COLLECTION_ALIAS = 'organizations';
export const CLASS_COLLECTION_ALIAS = 'classes';
export const TERMINOLOGY_SOURCE_COLLECTION_ALIAS = 'terminology-sources';

/** Stable, collection-independent synonym set (Typesense v30+ Synonym Sets API).
 *  Each versioned collection references it by name; its items are synced live
 *  each indexer run, so changing synonyms needs no reindex. */
export const SEARCH_SYNONYM_SET = 'dataset-register-synonyms';
