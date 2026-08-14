#!/usr/bin/env node
/**
 * Write the published GraphQL contract to `search-schema.graphql`.
 *
 * The surface consumers query is generated from `SEARCH_SCHEMA` by
 * `@lde/search-api-graphql` at boot, so nothing in this repository states it.
 * The test suite covers the declarations – names, paths, roles, `derive` – but
 * never builds the GraphQL schema, so it cannot see what the generator turns
 * them into: when `@lde/search` 0.18 moved paging under `pagination` and
 * renamed reference labels, every declaration test still passed.
 *
 * Committing the generated file puts that surface in `Files changed`, where a
 * reviewer already looks, and gives the published API a history: what moved
 * between two releases is a diff between two tags.
 *
 * Printed from the same `SEARCH_SCHEMA` + `SEARCH_SCHEMA_OPTIONS` pair the
 * served endpoint builds its handler from, so the file cannot describe a
 * different API from the one running. (A deployment that mounts a
 * schema-declaration module would use `search-print-sdl --module` instead; the
 * Dataset Register imports the schema directly, so it prints from code.)
 *
 * Formatted with this repository's Prettier config, so the pre-commit hook has
 * nothing left to reformat – were the two to disagree, each would undo the
 * other and CI would commit a difference on every run.
 */
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';
import { printGraphQLSchema } from '@lde/search-api-graphql';
import {
  SEARCH_SCHEMA,
  SEARCH_SCHEMA_OPTIONS,
} from '../packages/core/dist/search/index.js';

const outputPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'packages',
  'core',
  'search-schema.graphql',
);

const sdl = printGraphQLSchema(SEARCH_SCHEMA, SEARCH_SCHEMA_OPTIONS);
const config = await prettier.resolveConfig(outputPath);
await writeFile(
  outputPath,
  await prettier.format(sdl, { ...config, filepath: outputPath }),
);
console.log(`Wrote ${outputPath}`);
