import { describe, expect, it } from 'vitest';
import { sparqlIri } from '../src/sparql-iri.js';

describe('sparqlIri', () => {
  it('percent-encodes the braces and spaces of an inlined SPARQL CONSTRUCT', () => {
    const url = new URL(
      'http://api.bibliotheken.nl/datasets/KB/Production/sparql?query=CONSTRUCT%20{%20?s%20?p%20?o%20.%20}%20WHERE%20{%20GRAPH%20%3Chttp://data.bibliotheken.nl/datasetbeschrijvingen%3E%20{%20?s%20?p%20?o%20.%20}%20}',
    );

    const encoded = sparqlIri(url);

    expect(encoded).not.toMatch(/[{}]/);
    expect(encoded).toContain('CONSTRUCT%20%7B%20?s');
  });

  it('encodes every IRIREF-illegal character, including control characters', () => {
    expect(sparqlIri('a b')).toBe('a%20b');
    expect(sparqlIri('a\tb')).toBe('a%09b');
    expect(sparqlIri('a<b>c"d{e}f|g^h`i\\j')).toBe(
      'a%3Cb%3Ec%22d%7Be%7Df%7Cg%5Eh%60i%5Cj',
    );
  });

  it('leaves a valid IRI untouched and is idempotent', () => {
    const valid = 'https://example.org/path?a=1&b=2#frag';
    expect(sparqlIri(valid)).toBe(valid);
    expect(sparqlIri(sparqlIri('a {b}'))).toBe('a%20%7Bb%7D');
  });

  it('accepts both URL and string input', () => {
    expect(sparqlIri(new URL('https://example.org/x'))).toBe(
      'https://example.org/x',
    );
    expect(sparqlIri('https://example.org/x')).toBe('https://example.org/x');
  });
});
