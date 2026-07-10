import { describe, expect, it } from 'vitest';
import {
  cardFromItem,
  conformsToSchemaApNde,
  iiifManifestCount,
  providesWorkingIiif,
  type DatasetCard,
} from './datasets';
import type { DatasetItem } from './search/datasets';

// The boolean helpers only read the compatibility flags, so a minimal cast keeps
// the fixtures focused on the behaviour under test.
function card(fields: Partial<DatasetCard>): DatasetCard {
  return fields as DatasetCard;
}

// A GraphQL `Dataset` item with all-empty defaults; tests override the fields
// under test.
function item(fields: Partial<DatasetItem>): DatasetItem {
  return {
    id: 'https://example.org/dataset/x',
    title: [],
    description: [],
    language: [],
    publisher: [],
    status: 'valid',
    size: null,
    date_posted: null,
    format: [],
    iiif: null,
    iiif_manifest_count: null,
    nde_schema_ap: null,
    ...fields,
  };
}

describe('providesWorkingIiif', () => {
  it('is true when the index flags working IIIF', () => {
    expect(providesWorkingIiif(card({ iiif: true }))).toBe(true);
  });

  it('is false when the flag is absent', () => {
    expect(providesWorkingIiif(card({ iiif: false }))).toBe(false);
  });
});

describe('iiifManifestCount', () => {
  it('returns the declared manifest count', () => {
    expect(iiifManifestCount(card({ iiif_manifest_count: 5 }))).toBe(5);
  });

  it('returns 0 when the count is absent', () => {
    expect(iiifManifestCount(card({}))).toBe(0);
  });
});

describe('conformsToSchemaApNde', () => {
  it('is true when the index flags conformance', () => {
    expect(conformsToSchemaApNde(card({ nde_schema_ap: true }))).toBe(true);
  });

  it('is false when the flag is absent', () => {
    expect(conformsToSchemaApNde(card({ nde_schema_ap: false }))).toBe(false);
  });
});

describe('cardFromItem', () => {
  it('reshapes the localized title and description into `{nl, en}` records', () => {
    const result = cardFromItem(
      item({
        id: 'https://example.org/dataset/1',
        title: [
          { language: 'nl', value: 'Titel' },
          { language: 'en', value: 'Title' },
        ],
        description: [{ language: 'nl', value: 'Beschrijving' }],
      }),
    );
    expect(result.$id).toBe('https://example.org/dataset/1');
    expect(result.title).toEqual({ nl: 'Titel', en: 'Title' });
    expect(result.description).toEqual({ nl: 'Beschrijving' });
  });

  it('keeps a single-locale title and leaves an empty description absent', () => {
    const result = cardFromItem(
      item({ title: [{ language: 'en', value: 'English only' }] }),
    );
    expect(result.title).toEqual({ en: 'English only' });
    expect(result.description).toBeUndefined();
  });

  it('parses the ISO date_posted into a Date', () => {
    const result = cardFromItem(
      item({ date_posted: '2023-11-14T22:13:20.000Z' }),
    );
    expect(result.datePosted).toEqual(new Date('2023-11-14T22:13:20.000Z'));
  });

  it('carries the engine-resolved publisher label', () => {
    const result = cardFromItem(
      item({
        publisher: [
          {
            id: 'https://example.org/org/1',
            name: [
              { language: 'nl', value: 'Organisatie' },
              { language: 'en', value: 'Organization' },
            ],
          },
        ],
      }),
    );
    expect(result.publisher?.$id).toBe('https://example.org/org/1');
    expect(result.publisher?.name).toEqual({
      nl: 'Organisatie',
      en: 'Organization',
    });
  });

  it('falls back to the publisher IRI when no label was resolved', () => {
    const result = cardFromItem(
      item({ publisher: [{ id: 'https://example.org/org/2', name: [] }] }),
    );
    expect(result.publisher?.name).toEqual({
      '': 'https://example.org/org/2',
    });
  });

  it('reconstructs distribution badges from the combined format field', () => {
    const result = cardFromItem(
      item({
        format: ['text/turtle', 'text/csv', 'group:sparql', 'group:rdf'],
      }),
    );
    expect(
      result.distribution.some((distribution) =>
        distribution.conformsTo.includes(
          'https://www.w3.org/TR/sparql11-protocol/',
        ),
      ),
    ).toBe(true);
    expect(
      result.distribution.some(
        (distribution) => distribution.mediaType === 'text/turtle',
      ),
    ).toBe(true);
  });

  it('carries the IIIF flag, manifest count and compatibility boolean through', () => {
    const result = cardFromItem(
      item({ iiif: true, iiif_manifest_count: 5, nde_schema_ap: true }),
    );
    expect(result.iiif).toBe(true);
    expect(result.iiif_manifest_count).toBe(5);
    expect(result.nde_schema_ap).toBe(true);
  });
});
