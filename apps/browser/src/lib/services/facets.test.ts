import { describe, expect, it } from 'vitest';
import { mapFacets } from './facets';
import type { RawFacets } from './search/datasets';

// A GraphQL facet response as the browser query actually shapes it: reference
// facets (publisher, class, terminology_source) select `label`, so their buckets
// carry it; token/keyword facets (keyword, format, status) do NOT select it, so
// the response omits the field entirely — the bucket has no `label` key at all,
// which reads back as `undefined` (not `null`). Building the buckets literally,
// without a `label`, reproduces that shape.
function rawFacets(): RawFacets {
  return {
    publisher: [
      {
        value: 'https://example.org/org',
        count: 5,
        label: [{ language: 'nl', value: 'Voorbeeld' }],
      },
    ],
    keyword: [{ value: 'genealogie', count: 3 }],
    format: [
      { value: 'group:sparql', count: 7 },
      { value: 'text/turtle', count: 2 },
    ],
    class: [{ value: 'group:person', count: 4 }],
    terminology_source: [
      {
        value: 'http://vocab.getty.edu/aat',
        count: 1,
        label: [{ language: 'en', value: 'AAT' }],
      },
    ],
    status: [
      { value: 'valid', count: 100 },
      { value: 'invalid', count: 2 },
    ],
    size: [{ count: 8, min: 1000, max: 10000 }],
  };
}

describe('mapFacets', () => {
  // Regression: a bucket whose `label` field is absent (token/keyword facets the
  // query does not select it for) must not throw. It previously reached
  // `localizedRecord` as `undefined`, which only guarded `null`, so `for…of`
  // threw “values is not iterable” and the whole listing rendered empty.
  it('maps facets whose buckets have no label without throwing', () => {
    const facets = mapFacets(rawFacets());

    expect(facets.format).toEqual([
      { value: 'group:sparql', count: 7 },
      { value: 'text/turtle', count: 2 },
    ]);
    expect(facets.keyword).toEqual([{ value: 'genealogie', count: 3 }]);
  });

  it('keeps the resolved label on reference facet buckets', () => {
    const facets = mapFacets(rawFacets());

    expect(facets.publisher).toEqual([
      {
        value: 'https://example.org/org',
        count: 5,
        label: { nl: 'Voorbeeld' },
      },
    ]);
  });

  it('lists only the non-default statuses as toggles', () => {
    const facets = mapFacets(rawFacets());

    expect(facets.status).toEqual([{ value: 'invalid', count: 2 }]);
  });
});
