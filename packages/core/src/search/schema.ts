import { searchSchema } from '@lde/search';
import { SEARCH_TYPES } from './declarations.ts';

/**
 * The search schema shared by the indexer and the GraphQL query API, built from
 * the declarations in {@link ./declarations.ts}.
 *
 * Kept apart from the declarations so the mounted schema-declaration module can
 * bundle them without this call – see {@link ./module.ts}.
 */
export const SEARCH_SCHEMA = searchSchema(...SEARCH_TYPES);

export * from './declarations.ts';
