import { describe, expect, it } from 'vitest';
import { DataFactory } from 'n3';
import type { Quad } from '@rdfjs/types';
import { projectGraph } from '@lde/search';
import { SEARCH_FIELDS } from '@dataset-register/core';
import {
  DATASET_PROJECTION,
  deriveStatus,
  normalizeMediaType,
} from '../src/projection.ts';
import { buildCollectionSchema } from '../src/collection-schema.ts';

const { namedNode, literal, quad } = DataFactory;

const DCT = 'http://purl.org/dc/terms/';
const DCAT = 'http://www.w3.org/ns/dcat#';
const SCHEMA = 'https://schema.org/';
const DR = 'urn:dr:';
const XSD = 'http://www.w3.org/2001/XMLSchema#';
const IANA = 'https://www.iana.org/assignments/media-types/';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const STATUS_BASE = 'https://data.netwerkdigitaalerfgoed.nl/registry/';

/** A framed-IR value: an IRI reference, a (possibly typed/tagged) literal, or a bare string. */
type FramedValue =
  | { readonly '@id': string }
  | {
      readonly '@value': string;
      readonly '@language'?: string;
      readonly '@type'?: string;
    }
  | string;
type FramedFields = Record<string, FramedValue | readonly FramedValue[]>;
type FramedNode = { readonly '@id': string } & FramedFields;

/** Build the RDF object term for one framed value (the inverse of framing). */
function toObject(value: FramedValue) {
  if (typeof value === 'string') {
    return literal(value);
  }
  if ('@id' in value) {
    return namedNode(value['@id']);
  }
  if (value['@language'] !== undefined) {
    return literal(value['@value'], value['@language']);
  }
  if (value['@type'] !== undefined) {
    return literal(value['@value'], namedNode(value['@type']));
  }
  return literal(value['@value']);
}

/**
 * Turn a framed-IR fixture node back into CONSTRUCT-shaped quads so the test
 * drives the same public `projectGraph` (frame + project) path the indexer uses,
 * rather than the no-longer-exported `projectDocument`.
 */
function toQuads(node: FramedNode): Quad[] {
  const subject = namedNode(node['@id']);
  const quads: Quad[] = [
    quad(subject, namedNode(RDF_TYPE), namedNode(DATASET_PROJECTION.type)),
  ];
  for (const [predicate, raw] of Object.entries(node)) {
    if (predicate === '@id') {
      continue;
    }
    const values = Array.isArray(raw) ? raw : [raw as FramedValue];
    for (const value of values) {
      quads.push(quad(subject, namedNode(predicate), toObject(value)));
    }
  }
  return quads;
}

/** Project a framed-IR fixture node through the register projection. */
async function project(node: FramedNode): Promise<Record<string, unknown>> {
  for await (const document of projectGraph(toQuads(node), [
    DATASET_PROJECTION,
  ])) {
    return document;
  }
  return {};
}

const titled = (extra: FramedFields = {}): FramedNode => ({
  '@id': 'https://example.org/dataset/1',
  [`${DCT}title`]: { '@value': 'X' },
  ...extra,
});

describe('dataset projection', () => {
  it('folds searchable text per locale, stemmed in each language (#1661)', async () => {
    const document = await project({
      '@id': 'https://example.org/dataset/1',
      [`${DCT}title`]: [
        { '@language': 'nl', '@value': 'Møhlmann' },
        { '@language': 'en', '@value': 'Møhlmann collection' },
      ],
    });
    expect(document.title_search_nl).toBe('mohlmann');
    expect(document.title_search_en).toBe('mohlmann collection');
    expect(document.title_nl).toBe('Møhlmann');
    expect(document.title_en).toBe('Møhlmann collection');
    expect(document.title_sort_nl).toBe('mohlmann');
    expect(document.title_sort_en).toBe('mohlmann collection');
  });

  it('derives status and rank from the promoted registration facts', async () => {
    expect(deriveStatus([], undefined)).toBe('valid');
    expect(deriveStatus([], '2020-01-01T00:00:00Z')).toBe('archived');
    expect(deriveStatus([`${STATUS_BASE}invalid`], undefined)).toBe('invalid');
    expect(deriveStatus([`${STATUS_BASE}gone`], undefined)).toBe('gone');
    // gone wins over invalid.
    expect(
      deriveStatus([`${STATUS_BASE}invalid`, `${STATUS_BASE}gone`], undefined),
    ).toBe('gone');

    expect((await project(titled())).status).toBe('valid');
    expect((await project(titled())).status_rank).toBe(0);
    const invalid = await project(
      titled({
        [`${SCHEMA}additionalType`]: { '@id': `${STATUS_BASE}invalid` },
      }),
    );
    expect(invalid.status).toBe('invalid');
    expect(invalid.status_rank).toBe(2);
  });

  it('normalizes media types and derives format groups', async () => {
    expect(normalizeMediaType(`${IANA}text/turtle`)).toBe('text/turtle');

    const document = await project(
      titled({
        [`${DR}format`]: [`${IANA}text/turtle`, 'application/pdf'],
        [`${DR}conformsTo`]: 'https://www.w3.org/TR/sparql11-protocol/',
      }),
    );
    expect(document.format).toEqual(
      expect.arrayContaining(['text/turtle', 'application/pdf']),
    );
    expect(document.format_group).toEqual(['group:sparql', 'group:rdf']);
  });

  it('folds keywords and combines publisher + creator orgs in one facet', async () => {
    const document = await project(
      titled({
        [`${DCAT}keyword`]: [
          { '@language': 'nl', '@value': 'Persoon' },
          { '@language': 'nl', '@value': 'Persoon' },
        ],
        // The register pre-merges dct:publisher and dct:creator IRIs into the
        // single dr:organization facet, mirroring the browser’s combined facet.
        [`${DR}organization`]: [
          { '@id': 'https://example.org/org' },
          { '@id': 'https://example.org/creator' },
        ],
        [`${DR}publisherName`]: { '@language': 'nl', '@value': 'KB' },
        [`${DR}catalog`]: [
          { '@id': 'https://example.org/catalog/a' },
          { '@id': 'https://example.org/catalog/b' },
        ],
      }),
    );
    expect(document.keyword).toEqual(['Persoon']);
    expect(document.keyword_search).toEqual(['persoon']);
    expect(document.publisher).toEqual(
      expect.arrayContaining([
        'https://example.org/org',
        'https://example.org/creator',
      ]),
    );
    // Catalog membership (dct:isPartOf) projects as a multi-valued IRI facet.
    expect(document.catalog).toEqual(
      expect.arrayContaining([
        'https://example.org/catalog/a',
        'https://example.org/catalog/b',
      ]),
    );
    // Publisher is search-only: no display field is emitted (the card resolves
    // the publisher IRI to a label via the labels collection).
    expect(document.publisher_search_nl).toBe('kb');
    expect(document.publisher_name).toBeUndefined();
  });

  it('emits DKG facets and derives class_group from the merged IR', async () => {
    const document = await project(
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

  it('derives the NDE compatibility booleans from DKG DQV measurements', async () => {
    const document = await project(
      titled({
        // IIIF: declared entities + a validated manifest => met.
        [`${DR}iiifEntities`]: { '@type': `${XSD}integer`, '@value': '5' },
        [`${DR}manifestsSampled`]: { '@type': `${XSD}integer`, '@value': '3' },
        [`${DR}manifestsValidated`]: {
          '@type': `${XSD}integer`,
          '@value': '2',
        },
        // SCHEMA-AP-NDE: quads validated + conformant => met.
        [`${DR}quadsValidated`]: { '@type': `${XSD}integer`, '@value': '42' },
        [`${DR}schemaApNdeConformant`]: {
          '@type': `${XSD}boolean`,
          '@value': 'true',
        },
        // Linked data reuses dr:size (void:triples) + the schema-ap inputs.
        [`${DR}size`]: { '@type': `${XSD}integer`, '@value': '100' },
        // Terms: at least one terminology source => met.
        [`${DR}terminologySource`]: { '@id': 'https://vocab.getty.edu/aat/' },
        // Persistent URIs: all sampled resolved, no non-durable flag => met.
        [`${DR}subjectUrisSampled`]: {
          '@type': `${XSD}integer`,
          '@value': '10',
        },
        [`${DR}subjectUrisResolved`]: {
          '@type': `${XSD}integer`,
          '@value': '10',
        },
      }),
    );
    expect(document.iiif).toBe(true);
    expect(document.nde_schema_ap).toBe(true);
    expect(document.linked_data).toBe(true);
    expect(document.terms).toBe(true);
    expect(document.persistent_uris).toBe(true);
  });

  it('omits each compatibility boolean when its criterion is not met', async () => {
    const document = await project(
      titled({
        // IIIF declared but sampled-with-zero-validated => not met.
        [`${DR}iiifEntities`]: { '@type': `${XSD}integer`, '@value': '5' },
        [`${DR}manifestsSampled`]: { '@type': `${XSD}integer`, '@value': '3' },
        [`${DR}manifestsValidated`]: {
          '@type': `${XSD}integer`,
          '@value': '0',
        },
        // SCHEMA-AP-NDE: conformant claim over zero validated quads is vacuous.
        [`${DR}quadsValidated`]: { '@type': `${XSD}integer`, '@value': '0' },
        [`${DR}schemaApNdeConformant`]: {
          '@type': `${XSD}boolean`,
          '@value': 'true',
        },
        [`${DR}size`]: { '@type': `${XSD}integer`, '@value': '100' },
        // Persistent URIs: not all sampled resolved.
        [`${DR}subjectUrisSampled`]: {
          '@type': `${XSD}integer`,
          '@value': '10',
        },
        [`${DR}subjectUrisResolved`]: {
          '@type': `${XSD}integer`,
          '@value': '7',
        },
      }),
    );
    expect(document.iiif).toBeUndefined();
    expect(document.nde_schema_ap).toBeUndefined();
    expect(document.linked_data).toBeUndefined();
    expect(document.terms).toBeUndefined();
    expect(document.persistent_uris).toBeUndefined();
  });

  it('treats a non-durable subject namespace as not met for persistent URIs', async () => {
    const document = await project(
      titled({
        [`${DR}subjectUrisSampled`]: {
          '@type': `${XSD}integer`,
          '@value': '4',
        },
        [`${DR}subjectUrisResolved`]: {
          '@type': `${XSD}integer`,
          '@value': '4',
        },
        // The DKG flags a non-durable namespace with value false.
        [`${DR}subjectNamespaceDurable`]: {
          '@type': `${XSD}boolean`,
          '@value': 'false',
        },
      }),
    );
    expect(document.persistent_uris).toBeUndefined();
  });

  it('converts date_posted to unix seconds (the sort key)', async () => {
    const document = await project(
      titled({ [`${DR}datePosted`]: { '@value': '2024-01-02T00:00:00.000Z' } }),
    );
    expect(document.date_posted).toBe(
      Math.trunc(Date.parse('2024-01-02T00:00:00.000Z') / 1000),
    );
  });

  it('omits absent optional fields and DKG facets', async () => {
    const document = await project(titled());
    expect(document.description_search_nl).toBeUndefined();
    expect(document.publisher).toBeUndefined();
    expect(document.catalog).toBeUndefined();
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

  it('enables per-locale stemming on searchable fields', () => {
    const schema = buildCollectionSchema('datasets_test');
    const nl = schema.fields?.find((field) => field.name === 'title_search_nl');
    const en = schema.fields?.find((field) => field.name === 'title_search_en');
    expect(nl?.stem).toBe(true);
    expect(nl?.locale).toBe('nl');
    expect(en?.stem).toBe(true);
    expect(en?.locale).toBe('en');
  });

  it('references the synonym set', () => {
    const schema = buildCollectionSchema('datasets_test');
    expect(schema.synonym_sets).toEqual(['dataset-register-synonyms']);
  });
});
