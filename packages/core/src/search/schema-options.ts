import type { SearchQuery } from '@lde/search';

/**
 * The options the GraphQL surface is built with, alongside {@link SEARCH_SCHEMA}.
 *
 * Declared here rather than at the endpoint so the **served** API and the
 * **committed** contract (`search-schema.graphql`) are built from one source. A
 * `queryDefaults` that lived only in the server would make the printed SDL a
 * description of a different API than the one running.
 *
 * Deliberately untyped here, and written without `@lde/search`'s `filterOn`
 * helper: annotating it would make `@lde/search-api-graphql` part of this
 * package's public type surface (and so a dependency of the API and crawler
 * images, which serve no GraphQL), and the helper is a *value* import, which
 * would keep this file out of the importless schema-declaration module. The
 * `SearchQuery` annotation below is a type-only import, so it is erased before
 * bundling. The options shape is still checked where they are passed, against
 * `BuildGraphQLSchemaOptions`.
 */
export const SEARCH_SCHEMA_OPTIONS = {
  types: {
    Dataset: {
      /**
       * Default the dataset query to the valid-status filter when the caller
       * sends no status clause. The API's skip-own-filter then still counts the
       * status facet across every status (so the invalid/gone toggles have
       * counts), replacing the previous per-facet `includeDefaultStatus`
       * bookkeeping.
       */
      queryDefaults: (query: SearchQuery): SearchQuery =>
        query.where.some((clause) =>
          clause.or.some((criterion) => criterion.field === 'status'),
        )
          ? query
          : {
              ...query,
              where: [
                ...query.where,
                { or: [{ field: 'status', in: ['valid'] }] },
              ],
            },
    },
  },
};
