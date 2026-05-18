import { describe, expect, it } from 'vitest';
import { encodeUrlParam } from './url-param.js';

describe('encodeUrlParam', () => {
  it('leaves a simple URL almost untouched', () => {
    expect(encodeUrlParam('https://example.com/path')).toBe(
      'https://example.com/path',
    );
  });

  it('encodes characters that would break the surrounding query string', () => {
    expect(
      encodeUrlParam(
        'https://studiezaal.nijmegen.nl/AtlantisPubliek/Opendata/download-set?name=Catalog&format=RDF',
      ),
    ).toBe(
      'https://studiezaal.nijmegen.nl/AtlantisPubliek/Opendata/download-set%3Fname=Catalog%26format=RDF',
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

  it('encodes % first to avoid corrupting pre-encoded sequences', () => {
    expect(encodeUrlParam('https://example.com/100%')).toBe(
      'https://example.com/100%25',
    );
  });

  it('produces values that round-trip through URLSearchParams', () => {
    const original =
      'https://studiezaal.nijmegen.nl/AtlantisPubliek/Opendata/download-set?name=Catalog&format=RDF';
    const search = new URLSearchParams(`url=${encodeUrlParam(original)}`);
    expect(search.get('url')).toBe(original);
  });
});
