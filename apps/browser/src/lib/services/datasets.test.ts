import { describe, expect, it } from 'vitest';
import {
  cardFromDocument,
  conformsToSchemaApNde,
  providesWorkingIiif,
  type DatasetCard,
} from './datasets';
import type { SearchHitDocument } from './search/datasets';

// The boolean helpers only read the compatibility flags, so a minimal cast keeps
// the fixtures focused on the behaviour under test.
function card(fields: Partial<DatasetCard>): DatasetCard {
  return fields as DatasetCard;
}

const noLabels = {
  nl: new Map<string, string>(),
  en: new Map<string, string>(),
};

describe('providesWorkingIiif', () => {
  it('is true when the index flags working IIIF', () => {
    expect(providesWorkingIiif(card({ iiif: true }))).toBe(true);
  });

  it('is false when the flag is absent', () => {
    expect(providesWorkingIiif(card({ iiif: false }))).toBe(false);
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

describe('cardFromDocument', () => {
  it('maps title/description with same-locale value', () => {
    const document: SearchHitDocument = {
      id: 'https://example.org/dataset/1',
      title_nl: 'Titel',
      title_en: 'Title',
      description_nl: 'Beschrijving',
    };
    const result = cardFromDocument(document, 'nl', noLabels);
    expect(result.$id).toBe('https://example.org/dataset/1');
    expect(result.title).toEqual({ nl: 'Titel', en: 'Title' });
    expect(result.description).toEqual({ nl: 'Beschrijving' });
  });

  it('falls back to the other locale when the active one is missing', () => {
    const document: SearchHitDocument = {
      id: 'https://example.org/dataset/2',
      title_en: 'English only',
    };
    const result = cardFromDocument(document, 'nl', noLabels);
    expect(result.title).toEqual({ en: 'English only' });
    expect(result.description).toBeUndefined();
  });

  it('converts the unix date_posted to a Date', () => {
    const document: SearchHitDocument = {
      id: 'https://example.org/dataset/3',
      date_posted: 1700000000,
    };
    const result = cardFromDocument(document, 'nl', noLabels);
    expect(result.datePosted).toEqual(new Date(1700000000 * 1000));
  });

  it('resolves the publisher IRI to a localized label', () => {
    const document: SearchHitDocument = {
      id: 'https://example.org/dataset/4',
      publisher: ['https://example.org/org/1'],
    };
    const labels = {
      nl: new Map([['https://example.org/org/1', 'Organisatie']]),
      en: new Map([['https://example.org/org/1', 'Organization']]),
    };
    const result = cardFromDocument(document, 'nl', labels);
    expect(result.publisher?.name).toEqual({
      nl: 'Organisatie',
      en: 'Organization',
    });
  });

  it('falls back to the publisher IRI when no label exists', () => {
    const document: SearchHitDocument = {
      id: 'https://example.org/dataset/5',
      publisher: ['https://example.org/org/2'],
    };
    const result = cardFromDocument(document, 'nl', noLabels);
    expect(result.publisher?.name).toEqual({
      '': 'https://example.org/org/2',
    });
  });

  it('reconstructs distribution badges from format and format_group', () => {
    const document: SearchHitDocument = {
      id: 'https://example.org/dataset/6',
      format: ['text/turtle', 'text/csv'],
      format_group: ['group:sparql', 'group:rdf'],
    };
    const result = cardFromDocument(document, 'nl', noLabels);
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

  it('carries the compatibility booleans through', () => {
    const document: SearchHitDocument = {
      id: 'https://example.org/dataset/7',
      iiif: true,
      nde_schema_ap: true,
    };
    const result = cardFromDocument(document, 'nl', noLabels);
    expect(result.iiif).toBe(true);
    expect(result.nde_schema_ap).toBe(true);
  });
});
