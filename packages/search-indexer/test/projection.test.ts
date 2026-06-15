import { describe, expect, it } from 'vitest';
import { SEARCH_FIELDS } from '@dataset-register/core';
import {
  buildDocument,
  deriveStatus,
  normalizeMediaType,
  type RawDataset,
} from '../src/projection.ts';
import { buildCollectionSchema } from '../src/collection-schema.ts';

const STATUS_BASE = 'https://data.netwerkdigitaalerfgoed.nl/registry/';

function raw(overrides: Partial<RawDataset> = {}): RawDataset {
  return {
    iri: 'https://example.org/dataset/1',
    titles: [],
    descriptions: [],
    publisherNames: [],
    creatorNames: [],
    keywords: [],
    languages: [],
    publisherIris: [],
    mediaTypes: [],
    conformsTo: [],
    additionalTypes: [],
    ...overrides,
  };
}

describe('buildDocument', () => {
  it('folds searchable text across all languages (#1661)', () => {
    const document = buildDocument(
      raw({
        titles: [
          { value: 'Møhlmann', lang: 'nl' },
          { value: 'Møhlmann collection', lang: 'en' },
        ],
      }),
    );
    expect(document.title_search).toBe('mohlmann mohlmann collection');
    // Display fields keep the original per-locale values.
    expect(document.title_nl).toBe('Møhlmann');
    expect(document.title_en).toBe('Møhlmann collection');
    // Folded sort key from the primary (nl) title.
    expect(document.title_sort).toBe('mohlmann');
  });

  it('sets the source (scopes the deletion id-diff) and id', () => {
    const document = buildDocument(raw({ titles: [{ value: 'X', lang: '' }] }));
    expect(document.source).toBe('register');
    expect(document.id).toBe('https://example.org/dataset/1');
  });

  it('derives status and rank', () => {
    expect(deriveStatus(raw())).toBe('valid');
    expect(deriveStatus(raw({ validUntilIso: '2020-01-01T00:00:00Z' }))).toBe(
      'archived',
    );
    expect(
      deriveStatus(raw({ additionalTypes: [`${STATUS_BASE}invalid`] })),
    ).toBe('invalid');
    expect(deriveStatus(raw({ additionalTypes: [`${STATUS_BASE}gone`] }))).toBe(
      'gone',
    );
    // gone wins over invalid.
    expect(
      deriveStatus(
        raw({
          additionalTypes: [`${STATUS_BASE}invalid`, `${STATUS_BASE}gone`],
        }),
      ),
    ).toBe('gone');

    const document = buildDocument(raw({ titles: [{ value: 'X', lang: '' }] }));
    expect(document.status).toBe('valid');
    expect(document.status_rank).toBe(0);
  });

  it('normalizes media types and derives format groups', () => {
    expect(
      normalizeMediaType(
        'https://www.iana.org/assignments/media-types/text/turtle',
      ),
    ).toBe('text/turtle');

    const document = buildDocument(
      raw({
        titles: [{ value: 'X', lang: '' }],
        mediaTypes: [
          'https://www.iana.org/assignments/media-types/text/turtle',
          'application/pdf',
        ],
        conformsTo: ['https://www.w3.org/TR/sparql11-protocol/'],
      }),
    );
    expect(document.format).toEqual(['text/turtle', 'application/pdf']);
    expect(document.format_group).toEqual(['group:sparql', 'group:rdf']);
  });

  it('folds keywords and dedupes facet values', () => {
    const document = buildDocument(
      raw({
        titles: [{ value: 'X', lang: '' }],
        keywords: [
          { value: 'Persoon', lang: 'nl' },
          { value: 'Persoon', lang: 'nl' },
        ],
        publisherIris: ['https://example.org/org', 'https://example.org/org'],
      }),
    );
    expect(document.keyword_search).toEqual(['persoon']);
    expect(document.keyword).toEqual(['Persoon']);
    expect(document.publisher).toEqual(['https://example.org/org']);
  });

  it('converts dates to unix seconds', () => {
    const document = buildDocument(
      raw({
        titles: [{ value: 'X', lang: '' }],
        datePostedIso: '2024-01-02T00:00:00.000Z',
        dateReadIso: '2024-03-04T00:00:00.000Z',
      }),
    );
    expect(document.date_posted).toBe(
      Math.trunc(Date.parse('2024-01-02T00:00:00.000Z') / 1000),
    );
    expect(document.date_read).toBe(
      Math.trunc(Date.parse('2024-03-04T00:00:00.000Z') / 1000),
    );
  });

  it('omits absent optional fields', () => {
    const document = buildDocument(
      raw({ titles: [{ value: 'Only', lang: '' }] }),
    );
    expect(document.description_search).toBeUndefined();
    expect(document.publisher).toBeUndefined();
    expect(document.format).toBeUndefined();
  });
});

describe('buildCollectionSchema', () => {
  it('maps every registry field and sets the default sorting field', () => {
    const schema = buildCollectionSchema('datasets_test');
    expect(schema.name).toBe('datasets_test');
    expect(schema.fields).toHaveLength(SEARCH_FIELDS.length);
    expect(schema.default_sorting_field).toBe('status_rank');
  });

  it('enables Dutch stemming on searchable fields', () => {
    const schema = buildCollectionSchema('datasets_test');
    const titleSearch = schema.fields?.find(
      (field) => field.name === 'title_search',
    );
    expect(titleSearch?.stem).toBe(true);
    // locale selects the Snowball language; safe because values are pre-folded.
    expect(titleSearch?.locale).toBe('nl');
  });

  it('marks display fields as not indexed', () => {
    const schema = buildCollectionSchema('datasets_test');
    const titleNl = schema.fields?.find((field) => field.name === 'title_nl');
    expect(titleNl?.index).toBe(false);
  });

  it('references the synonym set', () => {
    const schema = buildCollectionSchema('datasets_test');
    expect(schema.synonym_sets).toEqual(['dataset-register-synonyms']);
  });
});
