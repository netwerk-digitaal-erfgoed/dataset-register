import { describe, expect, it } from 'vitest';
import { projectDocument, type FramedSubject } from '@lde/search';
import { SEARCH_FIELDS } from '@dataset-register/core';
import {
  DATASET_PROJECTION,
  deriveStatus,
  normalizeMediaType,
} from '../src/projection.ts';
import { buildCollectionSchema } from '../src/collection-schema.ts';

const DCT = 'http://purl.org/dc/terms/';
const DCAT = 'http://www.w3.org/ns/dcat#';
const SCHEMA = 'https://schema.org/';
const DR = 'urn:dr:';
const XSD = 'http://www.w3.org/2001/XMLSchema#';
const IANA = 'https://www.iana.org/assignments/media-types/';
const STATUS_BASE = 'https://data.netwerkdigitaalerfgoed.nl/registry/';

/** Project a framed IR node through the register projection. */
function project(node: FramedSubject): Record<string, unknown> {
  return projectDocument(node, DATASET_PROJECTION);
}

const titled = (extra: FramedSubject = {}): FramedSubject => ({
  '@id': 'https://example.org/dataset/1',
  [`${DCT}title`]: { '@value': 'X' },
  ...extra,
});

describe('dataset projection', () => {
  it('folds searchable text across all languages (#1661)', () => {
    const document = project({
      '@id': 'https://example.org/dataset/1',
      [`${DCT}title`]: [
        { '@language': 'nl', '@value': 'Møhlmann' },
        { '@language': 'en', '@value': 'Møhlmann collection' },
      ],
    });
    expect(document.title_search).toBe('mohlmann mohlmann collection');
    expect(document.title_nl).toBe('Møhlmann');
    expect(document.title_en).toBe('Møhlmann collection');
    expect(document.title_sort).toBe('mohlmann');
  });

  it('derives status and rank from the promoted registration facts', () => {
    expect(deriveStatus([], undefined)).toBe('valid');
    expect(deriveStatus([], '2020-01-01T00:00:00Z')).toBe('archived');
    expect(deriveStatus([`${STATUS_BASE}invalid`], undefined)).toBe('invalid');
    expect(deriveStatus([`${STATUS_BASE}gone`], undefined)).toBe('gone');
    // gone wins over invalid.
    expect(
      deriveStatus([`${STATUS_BASE}invalid`, `${STATUS_BASE}gone`], undefined),
    ).toBe('gone');

    expect(project(titled()).status).toBe('valid');
    expect(project(titled()).status_rank).toBe(0);
    const invalid = project(
      titled({
        [`${SCHEMA}additionalType`]: { '@id': `${STATUS_BASE}invalid` },
      }),
    );
    expect(invalid.status).toBe('invalid');
    expect(invalid.status_rank).toBe(2);
  });

  it('normalizes media types and derives format groups', () => {
    expect(normalizeMediaType(`${IANA}text/turtle`)).toBe('text/turtle');

    const document = project(
      titled({
        [`${DR}format`]: [`${IANA}text/turtle`, 'application/pdf'],
        [`${DR}conformsTo`]: 'https://www.w3.org/TR/sparql11-protocol/',
      }),
    );
    expect(document.format).toEqual(['text/turtle', 'application/pdf']);
    expect(document.format_group).toEqual(['group:sparql', 'group:rdf']);
  });

  it('folds keywords and dedupes facet values', () => {
    const document = project(
      titled({
        [`${DCAT}keyword`]: [
          { '@language': 'nl', '@value': 'Persoon' },
          { '@language': 'nl', '@value': 'Persoon' },
        ],
        [`${DCT}publisher`]: { '@id': 'https://example.org/org' },
        [`${DR}publisherName`]: { '@language': 'nl', '@value': 'KB' },
      }),
    );
    expect(document.keyword).toEqual(['Persoon']);
    expect(document.keyword_search).toEqual(['persoon']);
    expect(document.publisher).toEqual(['https://example.org/org']);
    expect(document.publisher_name).toBe('KB');
    expect(document.publisher_search).toBe('kb');
  });

  it('emits DKG facets and derives class_group from the merged IR', () => {
    const document = project(
      titled({
        [`${DR}class`]: [{ '@id': 'http://schema.org/Person' }],
        [`${DR}terminologySource`]: { '@id': 'https://vocab.getty.edu/aat/' },
        [`${DR}size`]: { '@type': `${XSD}integer`, '@value': '1234' },
      }),
    );
    expect(document.class).toEqual(['http://schema.org/Person']);
    expect(document.class_group).toEqual(['group:person']);
    expect(document.terminology_source).toEqual([
      'https://vocab.getty.edu/aat/',
    ]);
    expect(document.size).toBe(1234);
  });

  it('converts date_posted to unix seconds (the sort key)', () => {
    const document = project(
      titled({ [`${DR}datePosted`]: { '@value': '2024-01-02T00:00:00.000Z' } }),
    );
    expect(document.date_posted).toBe(
      Math.trunc(Date.parse('2024-01-02T00:00:00.000Z') / 1000),
    );
  });

  it('omits absent optional fields and DKG facets', () => {
    const document = project(titled());
    expect(document.description_search).toBeUndefined();
    expect(document.publisher).toBeUndefined();
    expect(document.format).toBeUndefined();
    expect(document.class).toBeUndefined();
    expect(document.size).toBeUndefined();
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
    expect(titleSearch?.locale).toBe('nl');
  });

  it('references the synonym set', () => {
    const schema = buildCollectionSchema('datasets_test');
    expect(schema.synonym_sets).toEqual(['dataset-register-synonyms']);
  });
});
