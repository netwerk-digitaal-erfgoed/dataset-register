import { describe, expect, it } from 'vitest';
import { Parser } from 'n3';
import type { Quad } from '@rdfjs/types';
import { projectRoots, type SearchDocument } from '@lde/search';
import { DATASET_TYPE, SEARCH_SCHEMA } from '../src/search/schema.ts';
import { REGISTRATION_STATUS_BASE_URI } from '../src/constants.ts';
import { SPARQL_PROTOCOL_URI } from '../src/search/media-types.ts';

/**
 * Frame + project a Turtle fixture into dataset search documents.
 *
 * `projectRoots` projects the one type it is handed over the roots the caller
 * names, so the roots come from the fixture’s `a dcat:Dataset` subjects – the
 * same typing the indexer’s register CONSTRUCT emits.
 */
async function project(turtle: string): Promise<SearchDocument[]> {
  const quads: Quad[] = new Parser().parse(turtle);
  const roots = quads
    .filter(
      (quad) =>
        quad.predicate.value === RDF_TYPE && quad.object.value === DATASET_TYPE,
    )
    .map((quad) => quad.subject.value);
  const datasetType = SEARCH_SCHEMA.get(DATASET_TYPE)!;
  const documents: SearchDocument[] = [];
  for await (const document of projectRoots(
    quads,
    [...new Set(roots)],
    SEARCH_SCHEMA,
    datasetType,
  )) {
    documents.push(document);
  }
  return documents;
}

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

/**
 * The fixtures are written in the projection’s **input** vocabulary, not the
 * source one: `@lde/search` reads each field back under its IR Alias
 * (`urn:lde:Dataset/‹field›`), which is what the indexer’s CONSTRUCTs emit. A
 * field’s `path` states what the reader reads from the source graph; it is never
 * what the projection sees. `a dcat:Dataset` stays a real type triple – it marks
 * the roots, it is not a field.
 */
const PREFIXES = `
  @prefix dcat: <http://www.w3.org/ns/dcat#> .
  @prefix ir: <urn:lde:Dataset/> .
`;

describe('dataset search schema projection', () => {
  it('projects a title into per-locale display, search, and sort fields', async () => {
    const [document] = await project(`${PREFIXES}
      <http://example.org/ds1> a dcat:Dataset ;
        ir:title "Verhalen"@nl, "Stories"@en .
    `);

    expect(document.id).toBe('http://example.org/ds1');
    expect(document.title_nl).toBe('Verhalen');
    expect(document.title_en).toBe('Stories');
    // The searchable and sort companions are folded (case/diacritic-normalized).
    expect(document.title_search_nl).toBe('verhalen');
    expect(document.title_sort_nl).toBe('verhalen');
  });

  it('folds diacritics in the search and sort companions (regression #1661)', async () => {
    const [document] = await project(`${PREFIXES}
      <http://example.org/ds1> a dcat:Dataset ;
        ir:title "Møhlmann"@nl .
    `);

    // The display field keeps the original spelling; the folded companions strip
    // the diacritic so a query for “Mohlmann” still matches “Møhlmann” (#1661).
    expect(document.title_nl).toBe('Møhlmann');
    expect(document.title_search_nl).toBe('mohlmann');
    expect(document.title_sort_nl).toBe('mohlmann');
  });

  it('projects a description into per-locale display and search fields', async () => {
    const [document] = await project(`${PREFIXES}
      <http://example.org/ds1> a dcat:Dataset ;
        ir:description "Een collectie"@nl, "A collection"@en .
    `);

    expect(document.description_nl).toBe('Een collectie');
    expect(document.description_en).toBe('A collection');
    expect(document.description_search_nl).toBe('een collectie');
  });

  it('keeps publisher and creator names per-locale searchable', async () => {
    const [document] = await project(`${PREFIXES}
      <http://example.org/ds1> a dcat:Dataset ;
        ir:publisherName "Rijksinstituut"@nl, "State Institute"@en ;
        ir:creator "Maker"@nl .
    `);

    expect(document.publisherName_search_nl).toBe('rijksinstituut');
    expect(document.publisherName_search_en).toBe('state institute');
    expect(document.creator_search_nl).toBe('maker');
  });

  it('projects publisher organization IRIs as a reference facet', async () => {
    const [document] = await project(`${PREFIXES}
      <http://example.org/ds1> a dcat:Dataset ;
        ir:publisher <https://example.org/org/rijks>, <https://example.org/org/kb> .
    `);

    expect(document.publisher).toEqual(
      expect.arrayContaining([
        'https://example.org/org/rijks',
        'https://example.org/org/kb',
      ]),
    );
  });

  it('projects catalog, class, and terminology-source reference IRIs', async () => {
    const [document] = await project(`${PREFIXES}
      <http://example.org/ds1> a dcat:Dataset ;
        ir:catalog <https://example.org/cat/1> ;
        ir:class_iri <https://schema.org/Person>, <https://schema.org/CreativeWork> ;
        ir:terminology_source <https://example.org/voc/aat> .
    `);

    expect(document.catalog).toEqual(['https://example.org/cat/1']);
    expect(document.class).toEqual(
      expect.arrayContaining([
        'https://schema.org/Person',
        'https://schema.org/CreativeWork',
      ]),
    );
    expect(document.terminology_source).toEqual([
      'https://example.org/voc/aat',
    ]);
  });

  it('projects language, normalized format, date, and size', async () => {
    const [document] = await project(`${PREFIXES}
      @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
      <http://example.org/ds1> a dcat:Dataset ;
        ir:language "nl", "en" ;
        ir:format_media_type
          "https://www.iana.org/assignments/media-types/application/ld+json",
          "text/turtle" ;
        ir:date_posted "2024-01-01T00:00:00Z"^^xsd:dateTime ;
        ir:size 1500 .
    `);

    expect(document.language).toEqual(expect.arrayContaining(['nl', 'en']));
    // The IANA IRI is stripped to the bare type; a bare type passes through.
    expect(document.format).toEqual(
      expect.arrayContaining(['application/ld+json', 'text/turtle']),
    );
    expect(document.date_posted).toBe(1704067200);
    expect(document.size).toBe(1500);
  });

  it('derives a valid status (rank 0) and no vinkjes for a bare dataset', async () => {
    const [document] = await project(`${PREFIXES}
      <http://example.org/ds1> a dcat:Dataset ; ir:title "X"@nl .
    `);

    expect(document.status).toBe('valid');
    expect(document.status_rank).toBe(0);
    expect(document.iiif).toBeUndefined();
    expect(document.nde_schema_ap).toBeUndefined();
    expect(document.linked_data).toBeUndefined();
    expect(document.terms).toBeUndefined();
    expect(document.persistent_uris).toBeUndefined();
  });

  it('derives a gone status (rank 3) from the registration marker', async () => {
    const [document] = await project(`${PREFIXES}
      @prefix schema: <https://schema.org/> .
      <http://example.org/ds1> a dcat:Dataset ;
        ir:additional_type <${REGISTRATION_STATUS_BASE_URI}gone> .
    `);

    expect(document.status).toBe('gone');
    expect(document.status_rank).toBe(3);
  });

  it('derives an invalid status (rank 2) from the registration marker', async () => {
    const [document] = await project(`${PREFIXES}
      @prefix schema: <https://schema.org/> .
      <http://example.org/ds1> a dcat:Dataset ;
        ir:additional_type <${REGISTRATION_STATUS_BASE_URI}invalid> .
    `);

    expect(document.status).toBe('invalid');
    expect(document.status_rank).toBe(2);
  });

  it('derives an archived status (rank 1) from a validUntil marker', async () => {
    const [document] = await project(`${PREFIXES}
      <http://example.org/ds1> a dcat:Dataset ;
        ir:valid_until "2020-01-01T00:00:00Z" .
    `);

    expect(document.status).toBe('archived');
    expect(document.status_rank).toBe(1);
  });

  it('leaves size-less linked_data and unparseable measurements unmet', async () => {
    const [document] = await project(`${PREFIXES}
      <http://example.org/ds1> a dcat:Dataset ;
        ir:quads_validated "not-a-number" ;
        ir:schema_ap_nde_conformant false ;
        ir:subject_namespace_durable false .
    `);

    expect(document.nde_schema_ap).toBeUndefined();
    expect(document.linked_data).toBeUndefined();
    expect(document.persistent_uris).toBeUndefined();
  });

  it('folds group tokens into the format and class fields', async () => {
    // The `format`/`class` facets carry both granular values and their coarse
    // `group:*` tokens in one field, so a facet selection mixing the two UNIONs
    // under the query API’s flat-AND `where`. The former `format_group`/
    // `class_group` companion fields are gone.
    const [document] = await project(`${PREFIXES}
      <http://example.org/ds1> a dcat:Dataset ;
        ir:format_media_type "text/turtle" ;
        ir:conforms_to "${SPARQL_PROTOCOL_URI}" ;
        ir:class_iri <https://schema.org/Person> .
    `);

    expect(document.format).toEqual(
      expect.arrayContaining(['text/turtle', 'group:rdf', 'group:sparql']),
    );
    expect(document.class).toEqual(
      expect.arrayContaining(['https://schema.org/Person', 'group:person']),
    );
    expect(document.format_group).toBeUndefined();
    expect(document.class_group).toBeUndefined();
  });

  it('sums the IIIF entity counts across subsets, skipping unparseable ones', async () => {
    // `iiif_entities` is a keyword array, not an integer: the projection coerces
    // only the FIRST literal of a numeric field, which would silently report one
    // subset's count as the whole. A value that is not a number contributes
    // nothing rather than turning the sum into NaN.
    const [document] = await project(`${PREFIXES}
      <http://example.org/ds1> a dcat:Dataset ;
        ir:iiif_entities 3, 4, "many" .
    `);

    expect(document.iiif_manifest_count).toBe(7);
  });

  it('derives the NDE compatibility vinkjes when their criteria are met', async () => {
    const [document] = await project(`${PREFIXES}
      <http://example.org/ds1> a dcat:Dataset ;
        ir:iiif_entities 3 ;
        ir:manifests_sampled 2 ;
        ir:manifests_validated 2 ;
        ir:quads_validated 100 ;
        ir:schema_ap_nde_conformant true ;
        ir:size 5000 ;
        ir:terminology_source <https://example.org/voc/aat> ;
        ir:subject_uris_sampled 10 ;
        ir:subject_uris_resolved 10 .
    `);

    expect(document.iiif_manifest_count).toBe(3);
    expect(document.iiif).toBe(true);
    expect(document.nde_schema_ap).toBe(true);
    expect(document.linked_data).toBe(true);
    expect(document.terms).toBe(true);
    expect(document.persistent_uris).toBe(true);
  });
});
