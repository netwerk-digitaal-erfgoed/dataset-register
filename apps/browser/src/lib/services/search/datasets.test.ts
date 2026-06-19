import { describe, expect, it, vi } from 'vitest';
import type { SearchResponse } from 'typesense/lib/Typesense/Documents.js';
import {
  facetFields,
  queryBy,
  queryByWeights,
} from '@dataset-register/core/search';
import type { SearchRequest } from '../datasets';
import {
  buildSearchParams,
  searchDatasets,
  type SearchHitDocument,
} from './datasets';

/** A searcher double standing in for the `fetch`-based `searchCollection`. */
type Searcher = (
  collection: string,
  params: Record<string, unknown>,
) => Promise<SearchResponse<SearchHitDocument>>;

/** An empty request: every multi-valued filter absent, no query, no size. */
function emptyRequest(): SearchRequest {
  return {
    publisher: [],
    keyword: [],
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

describe('buildSearchParams', () => {
  it('folds the query text and sets query_by with aligned weights', () => {
    const params = buildSearchParams(
      { ...emptyRequest(), query: 'Möhlmann' },
      DEFAULT_OPTIONS,
    );

    // Folding strips diacritics and lower-cases (per @lde/text-normalization).
    expect(params.q).toBe('mohlmann');
    expect(params.q).not.toBe('Möhlmann');
    expect(params.query_by).toBe(queryBy());
    expect(params.query_by_weights).toBe(queryByWeights());
  });

  it('uses the match-all query when no text is given', () => {
    const params = buildSearchParams(emptyRequest(), DEFAULT_OPTIONS);

    expect(params.q).toBe('*');
  });

  it('translates limit/offset into per_page and a 1-based page', () => {
    const params = buildSearchParams(emptyRequest(), {
      ...DEFAULT_OPTIONS,
      limit: 20,
      offset: 40,
    });

    expect(params.per_page).toBe(20);
    expect(params.page).toBe(3);
  });

  it('facets by every faceted index field', () => {
    const params = buildSearchParams(emptyRequest(), DEFAULT_OPTIONS);

    expect(params.facet_by).toBe(facetFields().join(','));
  });

  it('defaults to valid-only when no status is requested', () => {
    const params = buildSearchParams(emptyRequest(), DEFAULT_OPTIONS);

    expect(params.filter_by).toContain('status:=valid');
    expect(params.filter_by).not.toContain('status:[');
  });

  it('filters by the requested statuses instead of the default', () => {
    const params = buildSearchParams(
      { ...emptyRequest(), status: ['invalid', 'gone'] },
      DEFAULT_OPTIONS,
    );

    expect(params.filter_by).toContain('status:[`invalid`,`gone`]');
    expect(params.filter_by).not.toContain('status:=valid');
  });

  it('builds membership clauses for publisher, keyword and terminology source', () => {
    const params = buildSearchParams(
      {
        ...emptyRequest(),
        publisher: ['https://example.org/org/kb'],
        keyword: ['kunst'],
        terminologySource: ['https://vocab.getty.edu/aat/'],
      },
      DEFAULT_OPTIONS,
    );

    expect(params.filter_by).toContain(
      'publisher:[`https://example.org/org/kb`]',
    );
    expect(params.filter_by).toContain('keyword:[`kunst`]');
    expect(params.filter_by).toContain(
      'terminology_source:[`https://vocab.getty.edu/aat/`]',
    );
  });

  it('splits format values into granular media types and group companions', () => {
    const params = buildSearchParams(
      {
        ...emptyRequest(),
        format: ['application/ld+json', 'group:sparql', 'group:rdf'],
      },
      DEFAULT_OPTIONS,
    );

    expect(params.filter_by).toContain('format:[`application/ld+json`]');
    expect(params.filter_by).toContain(
      'format_group:[`group:sparql`,`group:rdf`]',
    );
  });

  it('splits class values into granular IRIs and group companions', () => {
    const params = buildSearchParams(
      {
        ...emptyRequest(),
        class: ['https://schema.org/Person', 'group:place'],
      },
      DEFAULT_OPTIONS,
    );

    expect(params.filter_by).toContain('class:[`https://schema.org/Person`]');
    expect(params.filter_by).toContain('class_group:[`group:place`]');
  });

  it('builds a closed size range when both bounds are set', () => {
    const params = buildSearchParams(
      { ...emptyRequest(), size: { min: 10, max: 1000 } },
      DEFAULT_OPTIONS,
    );

    expect(params.filter_by).toContain('size:[10..1000]');
  });

  it('builds a half-open size clause when only one bound is set', () => {
    const minOnly = buildSearchParams(
      { ...emptyRequest(), size: { min: 10 } },
      DEFAULT_OPTIONS,
    );
    const maxOnly = buildSearchParams(
      { ...emptyRequest(), size: { max: 1000 } },
      DEFAULT_OPTIONS,
    );

    expect(minOnly.filter_by).toContain('size:>=10');
    expect(maxOnly.filter_by).toContain('size:<=1000');
  });

  it('filters the catalog with the exact operator (non-facet, tokenized field)', () => {
    const params = buildSearchParams(
      { ...emptyRequest(), catalog: ['https://example.org/catalog/1'] },
      DEFAULT_OPTIONS,
    );

    // Exact `:=` so the tokenized IRI does not partial-match on path segments.
    expect(params.filter_by).toContain(
      'catalog:=[`https://example.org/catalog/1`]',
    );
  });

  it('AND-joins multiple filter clauses', () => {
    const params = buildSearchParams(
      { ...emptyRequest(), keyword: ['kunst'], publisher: ['https://a'] },
      DEFAULT_OPTIONS,
    );

    expect(params.filter_by).toContain(' && ');
  });

  it('sorts by post date descending for the datePosted order', () => {
    const params = buildSearchParams(emptyRequest(), {
      ...DEFAULT_OPTIONS,
      orderBy: 'datePosted',
    });

    expect(params.sort_by).toBe('date_posted:desc');
  });

  it('sorts by the active-locale title key then status rank for the title order', () => {
    const dutch = buildSearchParams(emptyRequest(), {
      ...DEFAULT_OPTIONS,
      orderBy: 'title',
      locale: 'nl',
    });
    const english = buildSearchParams(emptyRequest(), {
      ...DEFAULT_OPTIONS,
      orderBy: 'title',
      locale: 'en',
    });

    expect(dutch.sort_by).toBe('title_sort_nl:asc,status_rank:asc');
    expect(english.sort_by).toBe('title_sort_en:asc,status_rank:asc');
  });
});

describe('searchDatasets', () => {
  it('parses hits, total and facet counts from the Typesense response', async () => {
    const searchSpy = vi.fn(async () => ({
      found: 42,
      hits: [
        { document: { id: 'https://example.org/dataset/1', title_nl: 'Een' } },
        { document: { id: 'https://example.org/dataset/2', title_nl: 'Twee' } },
      ],
      facet_counts: [
        {
          field_name: 'keyword',
          counts: [
            { value: 'kunst', count: 7 },
            { value: 'geschiedenis', count: 3 },
          ],
        },
      ],
    }));

    const result = await searchDatasets(
      emptyRequest(),
      DEFAULT_OPTIONS,
      searchSpy as unknown as Searcher,
    );

    expect(result.total).toBe(42);
    expect(result.documents.map((document) => document.id)).toEqual([
      'https://example.org/dataset/1',
      'https://example.org/dataset/2',
    ]);
    expect(result.facetCounts.keyword).toEqual([
      { value: 'kunst', count: 7 },
      { value: 'geschiedenis', count: 3 },
    ]);
  });

  it('passes the built params to the search call', async () => {
    const searchSpy = vi.fn(
      async (
        collection: string,
        params: { q?: string; facet_by?: string | string[] },
      ) => {
        void collection;
        void params;
        return { found: 0, hits: [] };
      },
    );

    await searchDatasets(
      { ...emptyRequest(), query: 'kunst' },
      DEFAULT_OPTIONS,
      searchSpy as unknown as Searcher,
    );

    expect(searchSpy).toHaveBeenCalledTimes(1);
    const [, params] = searchSpy.mock.calls[0];
    expect(params.q).toBe('kunst');
    expect(params.facet_by).toBe(facetFields().join(','));
  });

  it('returns empty facet counts when the response carries none', async () => {
    const searchSpy = vi.fn(async () => ({ found: 0, hits: [] }));

    const result = await searchDatasets(
      emptyRequest(),
      DEFAULT_OPTIONS,
      searchSpy as unknown as Searcher,
    );

    expect(result.facetCounts).toEqual({});
    expect(result.documents).toEqual([]);
  });
});
