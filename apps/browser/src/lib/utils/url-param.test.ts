import { describe, expect, it } from 'vitest';
import { encodeUrlParam } from './url-param.js';

describe('encodeUrlParam', () => {
  it('leaves a simple URL almost untouched', () => {
    expect(encodeUrlParam('https://example.com/path')).toBe(
      'https://example.com/path',
    );
  });

  it('encodes & so it does not split the query into another parameter', () => {
    expect(
      encodeUrlParam(
        'https://studiezaal.nijmegen.nl/AtlantisPubliek/Opendata/download-set?name=Catalog&format=RDF',
      ),
    ).toBe(
      'https://studiezaal.nijmegen.nl/AtlantisPubliek/Opendata/download-set?name=Catalog%26format=RDF',
    );
  });

  it('encodes # so it is not treated as a fragment', () => {
    expect(encodeUrlParam('https://example.com/path#section')).toBe(
      'https://example.com/path%23section',
    );
  });

  it('encodes + and spaces so URLSearchParams does not turn them into spaces', () => {
    expect(encodeUrlParam('https://example.com/a b+c')).toBe(
      'https://example.com/a%20b%2Bc',
    );
  });

  it('leaves a second ? intact (RFC 3986 allows it in queries)', () => {
    expect(encodeUrlParam('https://example.com/path?x=1')).toBe(
      'https://example.com/path?x=1',
    );
  });

  it('produces values that round-trip through URLSearchParams', () => {
    const original =
      'https://studiezaal.nijmegen.nl/AtlantisPubliek/Opendata/download-set?name=Catalog&format=RDF';
    const search = new URLSearchParams(`url=${encodeUrlParam(original)}`);
    expect(search.get('url')).toBe(original);
  });
});
