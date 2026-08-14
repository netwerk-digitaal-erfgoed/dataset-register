import { describe, expect, it } from 'vitest';
import { filterOn, type SearchQuery } from '@lde/search';
import { SEARCH_SCHEMA_OPTIONS } from '../src/search/schema-options.ts';

const queryDefaults = SEARCH_SCHEMA_OPTIONS.types.Dataset.queryDefaults;

function query(where: SearchQuery['where'] = []): SearchQuery {
  return { where, orderBy: [], limit: 20, offset: 0, facets: [], locale: 'nl' };
}

describe('the Dataset query defaults', () => {
  it('narrows an unfiltered query to the valid datasets', () => {
    // The listing shows currently valid datasets unless a caller asks otherwise;
    // the API's skip-own-filter still counts the status facet across every
    // status, so the invalid/gone toggles keep their counts.
    const result = queryDefaults(query());

    expect(result.where).toEqual([filterOn({ field: 'status', in: ['valid'] })]);
  });

  it('leaves a query that already constrains status alone', () => {
    const explicit = query([filterOn({ field: 'status', in: ['gone'] })]);

    expect(queryDefaults(explicit)).toBe(explicit);
  });

  it('finds a status criterion inside a disjunction', () => {
    // A clause is a disjunction, so a status criterion can sit beside another
    // field's. Looking only at a clause's first criterion would re-apply the
    // valid-only default and make such a query return nothing.
    const disjunction = query([
      {
        or: [
          { field: 'publisher', in: ['https://example.org/org/1'] },
          { field: 'status', in: ['invalid'] },
        ],
      },
    ]);

    expect(queryDefaults(disjunction)).toBe(disjunction);
  });

  it('keeps the other clauses when it adds the default', () => {
    const filtered = query([filterOn({ field: 'format', in: ['group:rdf'] })]);

    expect(queryDefaults(filtered).where).toEqual([
      filterOn({ field: 'format', in: ['group:rdf'] }),
      filterOn({ field: 'status', in: ['valid'] }),
    ]);
  });
});
