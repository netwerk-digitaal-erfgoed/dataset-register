import { describe, expect, it } from 'vitest';
import type { Binding } from '@ldforge/core';
import { Parser } from 'sparqljs';
import { groupPublisherPlaces, placeDatasetsQuery } from './publisher-map';

describe('publisher map actions', () => {
  it('groups markers by place while retaining distinct publishers and identifiers', () => {
    const row = (place: string, iri: string): Binding => ({
      place: { type: 'uri', value: place },
      publisher: { type: 'uri', value: iri },
      publisherName: { type: 'literal', value: '<Example publisher>' },
      datasets: { type: 'literal', value: '3' },
    });
    const places = groupPublisherPlaces([
      row('https://example.org/city', 'https://example.org/a'),
      row('https://example.org/city', 'https://example.org/b'),
      row('https://example.org/city', 'https://example.org/a'),
      row('https://example.org/other', 'https://example.org/a'),
    ]);
    expect(places.size).toBe(2);
    expect(places.get('https://example.org/city')?.publishers.size).toBe(2);
    expect(
      places
        .get('https://example.org/city')
        ?.publishers.get('https://example.org/a')?.name,
    ).toBe('<Example publisher>');
  });

  it('builds a valid publisher query and rejects injected IRIREF content', () => {
    expect(() =>
      new Parser().parse(
        placeDatasetsQuery(['https://example.org/a', 'https://example.org/b']),
      ),
    ).not.toThrow();
    expect(() =>
      placeDatasetsQuery(['https://example.org/> } UNION { ?s ?p ?o']),
    ).toThrow('Invalid publisher IRI');
    expect(() => placeDatasetsQuery(['javascript:alert(1)'])).toThrow(
      'Invalid publisher IRI',
    );
  });
});
