import { describe, expect, it } from 'vitest';
import { Parser } from 'n3';
import type { Quad } from '@rdfjs/types';
import { projectGraph, type SearchDocument } from '@lde/search';
import { SEARCH_SCHEMA } from '../src/search/schema.ts';
import { REGISTRATION_STATUS_BASE_URI } from '../src/constants.ts';
import { SPARQL_PROTOCOL_URI } from '../src/search/media-types.ts';

/** Frame + project a Turtle fixture into search documents. */
async function project(turtle: string): Promise<SearchDocument[]> {
  const quads: Quad[] = new Parser().parse(turtle);
  const documents: SearchDocument[] = [];
  for await (const document of projectGraph(quads, SEARCH_SCHEMA)) {
    documents.push(document);
  }
  return documents;
}

const PREFIXES = `
  @prefix dcat: <http://www.w3.org/ns/dcat#> .
  @prefix dct: <http://purl.org/dc/terms/> .
`;

describe('dataset search schema projection', () => {
  it('projects a title into per-locale display, search, and sort fields', async () => {
    const [document] = await project(`${PREFIXES}
      <http://example.org/ds1> a dcat:Dataset ;
        dct:title "Verhalen"@nl, "Stories"@en .
    `);

    expect(document.id).toBe('http://example.org/ds1');
    expect(document.title_nl).toBe('Verhalen');
    expect(document.title_en).toBe('Stories');
    // The searchable and sort companions are folded (case/diacritic-normalized).
    expect(document.title_search_nl).toBe('verhalen');
    expect(document.title_sort_nl).toBe('verhalen');
  });

  it('projects a description into per-locale display and search fields', async () => {
    const [document] = await project(`${PREFIXES}
      <http://example.org/ds1> a dcat:Dataset ;
        dct:description "Een collectie"@nl, "A collection"@en .
    `);

    expect(document.description_nl).toBe('Een collectie');
    expect(document.description_en).toBe('A collection');
    expect(document.description_search_nl).toBe('een collectie');
  });

  it('projects keywords into a facet list and a folded searchable list', async () => {
    const [document] = await project(`${PREFIXES}
      <http://example.org/ds1> a dcat:Dataset ;
        dcat:keyword "Kunst", "Erfgoed" .
    `);

    expect(document.keyword).toEqual(expect.arrayContaining(['Kunst', 'Erfgoed']));
    expect(document.keyword_search).toEqual(
      expect.arrayContaining(['kunst', 'erfgoed']),
    );
  });

  it('keeps publisher and creator names per-locale searchable', async () => {
    const [document] = await project(`${PREFIXES}
      <http://example.org/ds1> a dcat:Dataset ;
        <urn:dr:publisherName> "Rijksinstituut"@nl, "State Institute"@en ;
        <urn:dr:creatorName> "Maker"@nl .
    `);

    expect(document.publisherName_search_nl).toBe('rijksinstituut');
    expect(document.publisherName_search_en).toBe('state institute');
    expect(document.creator_search_nl).toBe('maker');
  });

  it('projects publisher organization IRIs as a reference facet', async () => {
    const [document] = await project(`${PREFIXES}
      <http://example.org/ds1> a dcat:Dataset ;
        <urn:dr:organization> <https://example.org/org/rijks>, <https://example.org/org/kb> .
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
        <urn:dr:catalog> <https://example.org/cat/1> ;
        <urn:dr:class> <https://schema.org/Person>, <https://schema.org/CreativeWork> ;
        <urn:dr:terminologySource> <https://example.org/voc/aat> .
    `);

    expect(document.catalog).toEqual(['https://example.org/cat/1']);
    expect(document.class).toEqual(
      expect.arrayContaining([
        'https://schema.org/Person',
        'https://schema.org/CreativeWork',
      ]),
    );
    expect(document.terminology_source).toEqual(['https://example.org/voc/aat']);
  });

  it('projects language, normalized format, date, and size', async () => {
    const [document] = await project(`${PREFIXES}
      @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
      <http://example.org/ds1> a dcat:Dataset ;
        dct:language "nl", "en" ;
        <urn:dr:format>
          "https://www.iana.org/assignments/media-types/application/ld+json",
          "text/turtle" ;
        <urn:dr:datePosted> "2024-01-01T00:00:00Z"^^xsd:dateTime ;
        <urn:dr:size> 1500 .
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
      <http://example.org/ds1> a dcat:Dataset ; dct:title "X"@nl .
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
        schema:additionalType <${REGISTRATION_STATUS_BASE_URI}gone> .
    `);

    expect(document.status).toBe('gone');
    expect(document.status_rank).toBe(3);
  });

  it('derives an invalid status (rank 2) from the registration marker', async () => {
    const [document] = await project(`${PREFIXES}
      @prefix schema: <https://schema.org/> .
      <http://example.org/ds1> a dcat:Dataset ;
        schema:additionalType <${REGISTRATION_STATUS_BASE_URI}invalid> .
    `);

    expect(document.status).toBe('invalid');
    expect(document.status_rank).toBe(2);
  });

  it('derives an archived status (rank 1) from a validUntil marker', async () => {
    const [document] = await project(`${PREFIXES}
      <http://example.org/ds1> a dcat:Dataset ;
        <urn:dr:validUntil> "2020-01-01T00:00:00Z" .
    `);

    expect(document.status).toBe('archived');
    expect(document.status_rank).toBe(1);
  });

  it('leaves size-less linked_data and unparseable measurements unmet', async () => {
    const [document] = await project(`${PREFIXES}
      <http://example.org/ds1> a dcat:Dataset ;
        <urn:dr:quadsValidated> "not-a-number" ;
        <urn:dr:schemaApNdeConformant> false ;
        <urn:dr:subjectNamespaceDurable> false .
    `);

    expect(document.nde_schema_ap).toBeUndefined();
    expect(document.linked_data).toBeUndefined();
    expect(document.persistent_uris).toBeUndefined();
  });

  it('derives format_group and class_group tokens', async () => {
    const [document] = await project(`${PREFIXES}
      <http://example.org/ds1> a dcat:Dataset ;
        <urn:dr:format> "text/turtle" ;
        <urn:dr:conformsTo> "${SPARQL_PROTOCOL_URI}" ;
        <urn:dr:class> <https://schema.org/Person> .
    `);

    expect(document.format_group).toEqual(
      expect.arrayContaining(['group:rdf', 'group:sparql']),
    );
    expect(document.class_group).toEqual(['group:person']);
  });

  it('derives the NDE compatibility vinkjes when their criteria are met', async () => {
    const [document] = await project(`${PREFIXES}
      <http://example.org/ds1> a dcat:Dataset ;
        <urn:dr:iiifEntities> 3 ;
        <urn:dr:manifestsSampled> 2 ;
        <urn:dr:manifestsValidated> 2 ;
        <urn:dr:quadsValidated> 100 ;
        <urn:dr:schemaApNdeConformant> true ;
        <urn:dr:size> 5000 ;
        <urn:dr:terminologySource> <https://example.org/voc/aat> ;
        <urn:dr:subjectUrisSampled> 10 ;
        <urn:dr:subjectUrisResolved> 10 .
    `);

    expect(document.iiif_manifest_count).toBe(3);
    expect(document.iiif).toBe(true);
    expect(document.nde_schema_ap).toBe(true);
    expect(document.linked_data).toBe(true);
    expect(document.terms).toBe(true);
    expect(document.persistent_uris).toBe(true);
  });
});
