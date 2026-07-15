import { describe, expect, it, vi } from 'vitest';
import type { SearchRequest } from '../datasets';
import {
  buildOrderBy,
  buildWhere,
  type DatasetSearchResult,
  runDatasetSearch,
} from './datasets';

/** An empty request: every multi-valued filter absent, no query, no size. */
function emptyRequest(): SearchRequest {
  return {
    publisher: [],
    format: [],
    class: [],
    terminologySource: [],
    catalog: [],
    size: {},
    status: [],
  };
}

const DEFAULT_OPTIONS = {
  limit: 20,
  offset: 0,
  orderBy: 'title' as const,
  locale: 'nl' as const,
};

describe('buildWhere', () => {
  it('omits every clause for an empty request (the valid default is applied server-side)', () => {
    expect(buildWhere(emptyRequest())).toEqual({});
  });

  it('builds membership clauses for the facets', () => {
    expect(
      buildWhere({
        ...emptyRequest(),
        publisher: ['https://example.org/org/kb'],
        terminologySource: ['https://vocab.getty.edu/aat/'],
      }),
    ).toMatchObject({
      publisher: { in: ['https://example.org/org/kb'] },
      terminology_source: { in: ['https://vocab.getty.edu/aat/'] },
    });
  });

  it('puts granular values and group tokens in one membership clause (format/class)', () => {
    const where = buildWhere({
      ...emptyRequest(),
      format: ['application/ld+json', 'group:sparql', 'group:rdf'],
      class: ['https://schema.org/Person', 'group:place'],
    });

    // Combined-token fields: a granular value and its group tokens UNION in one
    // `in` (the query API’s flat-AND `where` cannot OR two separate fields).
    expect(where.format).toEqual({
      in: ['application/ld+json', 'group:sparql', 'group:rdf'],
    });
    expect(where.class).toEqual({
      in: ['https://schema.org/Person', 'group:place'],
    });
  });

  it('filters by the requested statuses', () => {
    expect(
      buildWhere({ ...emptyRequest(), status: ['invalid', 'gone'] }).status,
    ).toEqual({ in: ['invalid', 'gone'] });
  });

  it('builds a size range from either or both bounds', () => {
    expect(
      buildWhere({ ...emptyRequest(), size: { min: 10, max: 1000 } }).size,
    ).toEqual({
      min: 10,
      max: 1000,
    });
    expect(buildWhere({ ...emptyRequest(), size: { min: 10 } }).size).toEqual({
      min: 10,
    });
    expect(buildWhere({ ...emptyRequest(), size: { max: 1000 } }).size).toEqual(
      {
        max: 1000,
      },
    );
  });

  it('filters by catalog', () => {
    expect(
      buildWhere({
        ...emptyRequest(),
        catalog: ['https://example.org/catalog/1'],
      }).catalog,
    ).toEqual({ in: ['https://example.org/catalog/1'] });
  });
});

describe('buildOrderBy', () => {
  it('sorts by post date descending for the datePosted order', () => {
    expect(buildOrderBy('datePosted', false)).toEqual({
      field: 'DATE_POSTED',
      direction: 'DESC',
    });
  });

  it('ranks by relevance for a text query', () => {
    expect(buildOrderBy('title', true)).toEqual({
      field: 'RELEVANCE',
      direction: 'DESC',
    });
  });

  it('sorts by title for browse mode', () => {
    expect(buildOrderBy('title', false)).toEqual({
      field: 'TITLE',
      direction: 'ASC',
    });
  });

  it('keeps an explicit date order even with a text query', () => {
    expect(buildOrderBy('datePosted', true)).toEqual({
      field: 'DATE_POSTED',
      direction: 'DESC',
    });
  });
});

const PAYLOAD: DatasetSearchResult = {
  total: 42,
  items: [
    {
      id: 'https://example.org/dataset/1',
      title: [{ language: 'nl', value: 'Een' }],
      description: [],
      language: [],
      publisher: [],
      status: 'valid',
      size: null,
      date_posted: null,
      format: [],
      iiif: null,
      iiif_manifest_count: null,
      nde_schema_ap: null,
    },
  ],
  facets: {
    publisher: [],
    format: [],
    class: [],
    terminology_source: [],
    status: [],
    size: [],
  },
};

function fetchReturning(response: unknown): typeof fetch {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  ) as unknown as typeof fetch;
}

describe('runDatasetSearch', () => {
  it('posts the query + variables and parses the datasets payload', async () => {
    const fetchSpy = fetchReturning({ data: { datasets: PAYLOAD } });

    const result = await runDatasetSearch(
      {
        ...emptyRequest(),
        query: 'kunst',
        publisher: ['https://example.org/org/kb'],
      },
      { ...DEFAULT_OPTIONS, offset: 40 },
      { fetchImpl: fetchSpy },
    );

    expect(result).toEqual(PAYLOAD);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = (fetchSpy as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.variables.query).toBe('kunst');
    expect(body.variables.where.publisher).toEqual({
      in: ['https://example.org/org/kb'],
    });
    // offset 40 / limit 20 → the 3rd 1-based page.
    expect(body.variables.page).toBe(3);
    expect(body.variables.perPage).toBe(20);
    // The active UI locale rides in as Accept-Language.
    expect((init.headers as Record<string, string>)['Accept-Language']).toBe(
      'nl',
    );
  });

  it('omits the query variable when browsing (no text)', async () => {
    const fetchSpy = fetchReturning({ data: { datasets: PAYLOAD } });

    await runDatasetSearch(emptyRequest(), DEFAULT_OPTIONS, {
      fetchImpl: fetchSpy,
    });

    const [, init] = (fetchSpy as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.variables.query).toBeUndefined();
  });

  it('throws on a GraphQL error response', async () => {
    const fetchSpy = fetchReturning({ errors: [{ message: 'boom' }] });

    await expect(
      runDatasetSearch(emptyRequest(), DEFAULT_OPTIONS, {
        fetchImpl: fetchSpy,
      }),
    ).rejects.toThrow('boom');
  });
});
