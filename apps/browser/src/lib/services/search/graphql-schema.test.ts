import { describe, expect, it } from 'vitest';
import { printGraphQLSchema } from '@lde/search-api-graphql';
import { buildSchema, GraphQLInputObjectType, parse, validate } from 'graphql';
import { SEARCH_SCHEMA } from '@dataset-register/core/search';
import type { SearchRequest } from '../datasets';
import { buildWhere, DATASET_SEARCH_QUERY } from './datasets';

describe('search GraphQL contract', () => {
  it('emits a stable SDL for the dataset search schema', () => {
    // The public GraphQL contract is generated from SEARCH_SCHEMA at runtime, so
    // nothing in the repo shows a contract change as a reviewable diff. This
    // snapshot restores that: any change to the search schema – or to the
    // generator in a new @lde/search-api-graphql – fails here with the SDL diff
    // until it is consciously accepted (`vitest -u`) and reviewed.
    expect(printGraphQLSchema(SEARCH_SCHEMA)).toMatchSnapshot();
  });

  it('validates the browser listing query against the generated schema', () => {
    // The client query and the server contract are separate declarations; a
    // field the query selects but the schema does not expose (a typo, a dropped
    // output field, a renamed facet) would only surface as a runtime GraphQL
    // error. Validate it here so that drift fails the build instead. Rebuild the
    // schema from its own SDL with the test’s graphql instance so validation
    // stays in one realm (Vite otherwise loads a second graphql copy for the
    // library, tripping graphql-js’s cross-realm instanceof checks).
    const schema = buildSchema(printGraphQLSchema(SEARCH_SCHEMA));
    const errors = validate(schema, parse(DATASET_SEARCH_QUERY));
    expect(errors).toEqual([]);
  });

  it('exposes every filter buildWhere can emit as a DatasetWhere field', () => {
    // The `where` value is coerced against the DatasetWhere input at execution
    // time, which the query-document validation above does NOT check: a facet the
    // browser filters on but the schema does not expose as `filterable` (only
    // `facetable`) would silently fail every filtered search. Assert every field
    // buildWhere can emit is a declared DatasetWhere input field.
    const schema = buildSchema(printGraphQLSchema(SEARCH_SCHEMA));
    const whereType = schema.getType('DatasetWhere');
    if (!(whereType instanceof GraphQLInputObjectType)) {
      throw new Error('The schema does not declare a DatasetWhere input type.');
    }
    const whereFields = new Set(Object.keys(whereType.getFields()));

    // A request that populates every filter buildWhere knows how to emit.
    const fullRequest: SearchRequest = {
      query: 'x',
      publisher: ['p'],
      keyword: ['k'],
      format: ['f'],
      class: ['c'],
      terminologySource: ['t'],
      catalog: ['cat'],
      size: { min: 1, max: 2 },
      status: ['valid'],
    };
    for (const field of Object.keys(buildWhere(fullRequest))) {
      expect(whereFields).toContain(field);
    }
  });
});
