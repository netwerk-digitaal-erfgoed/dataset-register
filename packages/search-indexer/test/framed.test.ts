import { describe, expect, it } from 'vitest';
import { framedDatasetToRaw } from '../src/framed.ts';
import { buildDocument } from '../src/projection.ts';

const XSD = 'http://www.w3.org/2001/XMLSchema#';

/** A framed dataset node as jsonld.frame() emits it (full-IRI keys, no context):
 *  single-valued predicates are a bare object, multi-valued are arrays, literals
 *  are {@value,@language|@type} or bare strings, IRIs are {@id}. */
const node = {
  '@id': 'https://ex.org/d/1',
  '@type': 'http://www.w3.org/ns/dcat#Dataset',
  'http://purl.org/dc/terms/title': [
    { '@language': 'nl', '@value': 'Titel' },
    { '@language': 'en', '@value': 'Title' },
  ],
  'http://purl.org/dc/terms/description': { '@language': 'nl', '@value': 'Besch' },
  'http://www.w3.org/ns/dcat#keyword': [{ '@language': 'nl', '@value': 'erfgoed' }],
  'http://purl.org/dc/terms/language': ['nl', 'en'],
  'http://purl.org/dc/terms/publisher': {
    '@id': 'https://ex.org/org/1',
    'http://xmlns.com/foaf/0.1/name': { '@language': 'nl', '@value': 'Erfgoed' },
  },
  'http://purl.org/dc/terms/creator': {
    '@id': 'https://ex.org/d/1/creator',
    'http://xmlns.com/foaf/0.1/name': { '@value': 'Maker' },
  },
  'http://www.w3.org/ns/dcat#distribution': [
    {
      '@id': 'https://ex.org/d/1/dist/1',
      'http://www.w3.org/ns/dcat#mediaType': {
        '@id': 'https://www.iana.org/assignments/media-types/text/turtle',
      },
      'http://purl.org/dc/terms/conformsTo': {
        '@id': 'https://www.w3.org/TR/sparql11-protocol/',
      },
    },
    {
      '@id': 'https://ex.org/d/1/dist/2',
      'http://www.w3.org/ns/dcat#mediaType': {
        '@id': 'https://www.iana.org/assignments/media-types/application/ld+json',
      },
    },
  ],
  'https://schema.org/additionalType': {
    '@id': 'https://data.netwerkdigitaalerfgoed.nl/registry/invalid',
  },
  'urn:dr:dateRead': {
    '@type': `${XSD}dateTime`,
    '@value': '2024-02-01T00:00:00.000Z',
  },
  'urn:dr:datePosted': {
    '@type': `${XSD}dateTime`,
    '@value': '2024-01-01T00:00:00.000Z',
  },
  'urn:dr:class': [{ '@id': 'http://schema.org/Person' }],
  'urn:dr:terminologySource': { '@id': 'https://vocab.getty.edu/aat/' },
  'urn:dr:size': { '@type': `${XSD}integer`, '@value': '1234' },
};

describe('framedDatasetToRaw', () => {
  it('maps the framed JSON-LD IR to a RawDataset', () => {
    const raw = framedDatasetToRaw(node);
    expect(raw.iri).toBe('https://ex.org/d/1');
    expect(raw.titles).toEqual([
      { value: 'Titel', lang: 'nl' },
      { value: 'Title', lang: 'en' },
    ]);
    expect(raw.descriptions).toEqual([{ value: 'Besch', lang: 'nl' }]);
    expect(raw.keywords).toEqual([{ value: 'erfgoed', lang: 'nl' }]);
    expect(raw.languages).toEqual(['nl', 'en']);
    expect(raw.publisherIris).toEqual(['https://ex.org/org/1']);
    expect(raw.publisherNames).toEqual([{ value: 'Erfgoed', lang: 'nl' }]);
    expect(raw.creatorNames).toEqual([{ value: 'Maker', lang: '' }]);
    expect(raw.mediaTypes).toEqual([
      'https://www.iana.org/assignments/media-types/text/turtle',
      'https://www.iana.org/assignments/media-types/application/ld+json',
    ]);
    expect(raw.conformsTo).toEqual(['https://www.w3.org/TR/sparql11-protocol/']);
    expect(raw.additionalTypes).toEqual([
      'https://data.netwerkdigitaalerfgoed.nl/registry/invalid',
    ]);
    expect(raw.dateReadIso).toBe('2024-02-01T00:00:00.000Z');
    expect(raw.datePostedIso).toBe('2024-01-01T00:00:00.000Z');
    expect(raw.classes).toEqual(['http://schema.org/Person']);
    expect(raw.terminologySources).toEqual(['https://vocab.getty.edu/aat/']);
    expect(raw.size).toBe(1234);
  });

  it('feeds buildDocument end-to-end (IR → doc)', () => {
    const document = buildDocument(framedDatasetToRaw(node));
    expect(document.title_nl).toBe('Titel');
    expect(document.title_en).toBe('Title');
    expect(document.status).toBe('invalid');
    expect(document.publisher).toEqual(['https://ex.org/org/1']);
    expect(document.format).toEqual(['text/turtle', 'application/ld+json']);
    expect(document.format_group).toEqual(['group:sparql', 'group:rdf']);
    expect(document.class_group).toEqual(['group:person']);
    expect(document.size).toBe(1234);
  });

  it('coerces exotic JSON-LD value shapes defensively', () => {
    const raw = framedDatasetToRaw({
      '@id': 'https://ex.org/d/3',
      'http://purl.org/dc/terms/title': { '@value': 'T' },
      // Numeric and boolean @value, a bare-string IRI, and validUntil all coerce.
      'http://purl.org/dc/terms/language': { '@value': true },
      'urn:dr:validUntil': { '@value': '2030-01-01T00:00:00.000Z' },
      'urn:dr:class': 'http://example.org/BareClass',
      'urn:dr:size': { '@value': 5678 },
    });
    expect(raw.languages).toEqual(['true']);
    expect(raw.validUntilIso).toBe('2030-01-01T00:00:00.000Z');
    expect(raw.classes).toEqual(['http://example.org/BareClass']);
    expect(raw.size).toBe(5678);
  });

  it('handles a minimal node (only id + one title)', () => {
    const raw = framedDatasetToRaw({
      '@id': 'https://ex.org/d/2',
      'http://purl.org/dc/terms/title': { '@value': 'Solo' },
    });
    expect(raw.iri).toBe('https://ex.org/d/2');
    expect(raw.titles).toEqual([{ value: 'Solo', lang: '' }]);
    expect(raw.languages).toEqual([]);
    expect(raw.classes).toBeUndefined();
    expect(raw.size).toBeUndefined();
  });
});
