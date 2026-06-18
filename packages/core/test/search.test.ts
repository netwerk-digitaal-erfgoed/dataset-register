import { describe, expect, it } from 'vitest';
import {
  CLASS_GROUPS,
  DEFAULT_SORTING_FIELD,
  deriveClassGroups,
  facetFields,
  queryBy,
  queryByWeights,
  searchableFields,
  SEARCH_FIELDS,
  SEARCH_SYNONYMS,
} from '../src/search/index.ts';

describe('search field registry', () => {
  it('has unique field names', () => {
    const names = SEARCH_FIELDS.map((field) => field.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('orders query_by by descending weight, title first', () => {
    expect(searchableFields()[0].name).toBe('title_search_nl');
    expect(queryBy()).toBe(
      'title_search_nl,title_search_en,publisher_search_nl,publisher_search_en,description_search_nl,description_search_en,creator_search_nl,creator_search_en,keyword_search',
    );
    expect(queryByWeights()).toBe('5,5,3,3,2,2,2,2,1');
  });

  it('only marks weighted fields as searchable', () => {
    for (const field of searchableFields()) {
      expect(field.weight).toBeGreaterThan(0);
    }
  });

  it('exposes the listing facets', () => {
    expect(facetFields()).toEqual(
      expect.arrayContaining([
        'publisher',
        'keyword',
        'format',
        'status',
        'language',
        'class',
        'terminology_source',
        'size',
      ]),
    );
  });

  it('does not expose the vestigial incremental source facet', () => {
    expect(facetFields()).not.toContain('source');
  });

  it('has a sortable numeric default sorting field', () => {
    const field = SEARCH_FIELDS.find(
      (candidate) => candidate.name === DEFAULT_SORTING_FIELD,
    );
    expect(field?.sort).toBe(true);
    expect(field?.type).toMatch(/^int/);
  });

  it('enables per-locale stemming only on folded searchable fields', () => {
    for (const field of SEARCH_FIELDS) {
      if (field.stem) {
        expect(field.name).toMatch(/_search(_[a-z]{2})?$/);
        expect(field.weight).toBeGreaterThan(0);
      }
    }
  });
});

describe('class groups', () => {
  it('maps a schema.org class to its group', () => {
    expect(deriveClassGroups(['http://schema.org/Person'])).toEqual([
      'group:person',
    ]);
  });

  it('returns no group for a class outside the table', () => {
    expect(deriveClassGroups(['http://example.org/Unknown'])).toEqual([]);
  });

  it('assigns a class shared by several groups to each of them', () => {
    // CIDOC E39_Actor is both a person and an organization.
    expect(
      deriveClassGroups(['http://www.cidoc-crm.org/cidoc-crm/E39_Actor']),
    ).toEqual(expect.arrayContaining(['group:person', 'group:organization']));
  });

  it('keys every group with a group: prefix', () => {
    for (const group of Object.keys(CLASS_GROUPS)) {
      expect(group).toMatch(/^group:/);
    }
  });
});

describe('search synonyms', () => {
  it('stores synonyms folded (lowercase, diacritic-free)', () => {
    for (const group of SEARCH_SYNONYMS) {
      for (const term of group) {
        expect(term).toBe(term.toLowerCase());
        expect(term.normalize('NFKD')).toBe(term);
      }
    }
  });

  it('keeps the cross-lingual persoon/person group', () => {
    const personGroup = SEARCH_SYNONYMS.find((group) =>
      group.includes('persoon'),
    );
    expect(personGroup).toEqual(
      expect.arrayContaining(['persoon', 'person', 'people']),
    );
  });
});
