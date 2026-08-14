import { SEARCH_TYPES } from './declarations.ts';

/**
 * The **schema-declaration module**: the one file the prebuilt LDE images mount.
 *
 * `@lde/search-indexer` and `@lde/search-api-server` both boot by loading a
 * module that default-exports a deployment's search type declarations as plain
 * data, validating them the way they would a SHACL generator's output. Mounting
 * the same file on both is what keeps the write side and the read side from
 * disagreeing about the schema.
 *
 * This file is the **source** of that module, not the artefact. A mounted file
 * cannot resolve bare specifiers, so it is bundled to importless ESM first
 * (`nx run @dataset-register/core:schema-module`), with `@lde/search` aliased to
 * a stub – `defineSearchType` is an identity function at runtime, so nothing is
 * lost, and the real package's CJS dependencies stay out of what must be a lean
 * module. Authoring in TypeScript keeps the full compile-time checking; the
 * `derive` and `transform` functions survive bundling as the plain functions
 * they are.
 */
export default SEARCH_TYPES;

/**
 * Forwarded to `buildGraphQLSchema` by whatever serves this module, so a mounted
 * API applies the same query defaults as the endpoint embedded in the browser.
 */
export { SEARCH_SCHEMA_OPTIONS as schemaOptions } from './schema-options.ts';
