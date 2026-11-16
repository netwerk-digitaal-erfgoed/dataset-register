import { describe, expect, it } from 'vitest';
import { datasetDetailHref, datasetQueryHref } from './url';

describe('datasetDetailHref', () => {
  it('leaves the IRI literal in the query string', () => {
    expect(
      datasetDetailHref(
        'https://data.colonialcollections.nl/nmvw/collection-archives',
      ),
    ).toBe(
      '/dataset?uri=https://data.colonialcollections.nl/nmvw/collection-archives',
    );
  });

  it('preserves the http scheme without coercing to https', () => {
    expect(datasetDetailHref('http://legacy.example/foo')).toBe(
      '/dataset?uri=http://legacy.example/foo',
    );
  });

  it('encodes only characters that break query parsing', () => {
    const href = datasetDetailHref(
      'https://example.org/p?x=1&y=2#frag+plus%20',
    );
    expect(href).toBe(
      '/dataset?uri=https://example.org/p?x=1%26y=2%23frag%2Bplus%2520',
    );
  });

  it('round-trips through URLSearchParams', () => {
    const original = 'https://example.org/p?x=1&y=2#frag+plus%20';
    const href = datasetDetailHref(original);
    const value = new URL('http://x' + href).searchParams.get('uri');
    expect(value).toBe(original);
  });
});

describe('datasetQueryHref', () => {
  it('round-trips the dataset and endpoint through URLSearchParams', () => {
    const dataset = 'https://example.org/dataset?id=1&v=2';
    const endpoint = 'https://example.org/sparql?graph=a&b#c';
    const params = new URL('http://x' + datasetQueryHref(dataset, endpoint))
      .searchParams;
    expect(params.get('dataset')).toBe(dataset);
    expect(params.get('endpoint')).toBe(endpoint);
  });
});
