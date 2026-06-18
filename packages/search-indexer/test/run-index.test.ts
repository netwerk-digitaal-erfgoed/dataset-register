import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'typesense';
import type { SearchParams } from 'typesense/lib/Typesense/Documents.js';
import { fold } from '@lde/text-normalization';
import {
  LABELS_COLLECTION_ALIAS,
  queryBy,
  queryByWeights,
  SEARCH_COLLECTION_ALIAS,
  SparqlClient,
} from '@dataset-register/core';
import {
  createTypesenseClient,
  type TypesenseConnection,
} from '../src/typesense-client.ts';
import { runIndex } from '../src/run-index.ts';
import { QLeverContainer } from './qlever-container.ts';
import { TypesenseContainer } from './typesense-container.ts';

const REGISTRATIONS_GRAPH = 'https://example.org/registry/registrations';
const STATUS_BASE = 'https://data.netwerkdigitaalerfgoed.nl/registry/';
const TURTLE = 'https://www.iana.org/assignments/media-types/text/turtle';
const SPARQL_PROTOCOL = 'https://www.w3.org/TR/sparql11-protocol/';
const base = (slug: string) => `https://example.org/dataset/${slug}`;

interface Seed {
  slug: string;
  titleNl: string;
  descriptionNl?: string;
  publisherIri?: string;
  publisherName?: string;
  creatorIri?: string;
  creatorName?: string;
  mediaType?: string;
  conformsTo?: string;
  status?: 'invalid' | 'gone';
}

const SEEDS: readonly Seed[] = [
  {
    slug: 'mohlmann',
    titleNl: 'Møhlmann',
    publisherIri: 'https://example.org/org/kb',
    publisherName: 'Koninklijke Bibliotheek',
    creatorIri: 'https://example.org/org/na',
    creatorName: 'Nationaal Archief',
    mediaType: TURTLE,
    conformsTo: SPARQL_PROTOCOL,
  },
  {
    slug: 'verhaal-utrecht',
    titleNl: 'Verhaal van Utrecht',
    descriptionNl: 'Een platform met veel informatie over de stad Utrecht',
  },
  { slug: 'persoon', titleNl: 'Persoon en plaats' },
  { slug: 'fietsen-title', titleNl: 'Fietsen in Nederland' },
  {
    slug: 'fietsen-desc',
    titleNl: 'Wegen en paden',
    descriptionNl: 'Allerlei informatie over fietsen',
  },
  {
    slug: 'gone-fietsen',
    titleNl: 'Verdwenen fietsen dataset',
    status: 'gone',
  },
];

function insertQuery(seed: Seed): string {
  const iri = base(seed.slug);
  const datasetTriples = [`<${iri}> a <http://www.w3.org/ns/dcat#Dataset> ;`];
  const parts = [`  <http://purl.org/dc/terms/title> "${seed.titleNl}"@nl`];
  if (seed.descriptionNl) {
    parts.push(
      `  <http://purl.org/dc/terms/description> "${seed.descriptionNl}"@nl`,
    );
  }
  if (seed.publisherIri) {
    parts.push(`  <http://purl.org/dc/terms/publisher> <${seed.publisherIri}>`);
  }
  if (seed.creatorIri) {
    parts.push(`  <http://purl.org/dc/terms/creator> <${seed.creatorIri}>`);
  }
  if (seed.mediaType || seed.conformsTo) {
    parts.push(`  <http://www.w3.org/ns/dcat#distribution> <${iri}/dist>`);
  }
  datasetTriples.push(parts.join(' ;\n') + ' .');
  if (seed.publisherIri) {
    datasetTriples.push(
      `<${seed.publisherIri}> <http://xmlns.com/foaf/0.1/name> "${seed.publisherName}" .`,
    );
  }
  if (seed.creatorIri && seed.creatorName) {
    datasetTriples.push(
      `<${seed.creatorIri}> <http://xmlns.com/foaf/0.1/name> "${seed.creatorName}" .`,
    );
  }
  if (seed.mediaType || seed.conformsTo) {
    const distTriples = [
      `<${iri}/dist> a <http://www.w3.org/ns/dcat#Distribution>`,
    ];
    if (seed.mediaType) {
      distTriples.push(
        `  <http://www.w3.org/ns/dcat#mediaType> <${seed.mediaType}>`,
      );
    }
    if (seed.conformsTo) {
      distTriples.push(
        `  <http://purl.org/dc/terms/conformsTo> <${seed.conformsTo}>`,
      );
    }
    datasetTriples.push(distTriples.join(' ;\n') + ' .');
  }

  const registration = [
    `<${iri}/registration> a <https://schema.org/EntryPoint> ;`,
    `  <https://schema.org/about> <${iri}> ;`,
    `  <https://schema.org/datePosted> "2024-01-01T00:00:00.000Z"^^<http://www.w3.org/2001/XMLSchema#dateTime> ;`,
    `  <https://schema.org/dateRead> "2024-02-01T00:00:00.000Z"^^<http://www.w3.org/2001/XMLSchema#dateTime>`,
  ];
  if (seed.status) {
    registration.push(
      `  ; <https://schema.org/additionalType> <${STATUS_BASE}${seed.status}>`,
    );
  }
  registration.push(' .');

  return `
    INSERT DATA {
      GRAPH <${iri}> {
        ${datasetTriples.join('\n')}
      }
      GRAPH <${REGISTRATIONS_GRAPH}> {
        ${registration.join('\n')}
      }
    }`;
}

const PERSON_CLASS = 'http://schema.org/Person';
const AAT = 'https://vocab.getty.edu/aat/';

/** Seed the DKG store with void enrichment for a dataset, keyed by its IRI. */
function dkgInsertQuery(slug: string, classes: readonly string[]): string {
  const iri = base(slug);
  const partitions = classes
    .map(
      (classIri, index) => `
      <${iri}> <http://rdfs.org/ns/void#classPartition> <${iri}/partition/${index}> .
      <${iri}/partition/${index}> <http://rdfs.org/ns/void#class> <${classIri}> .`,
    )
    .join('\n');
  return `INSERT DATA {${partitions}\n}`;
}

const VOID = 'http://rdfs.org/ns/void#';
const DCT = 'http://purl.org/dc/terms/';
const DQV = 'http://www.w3.org/ns/dqv#';
const METRIC = 'https://def.nde.nl/metric#';
const IIIF_PRESENTATION_API = 'http://iiif.io/api/presentation/';
const XSD_BOOLEAN = 'http://www.w3.org/2001/XMLSchema#boolean';

/** A `dqv:hasQualityMeasurement` of a metric carrying a typed value, keyed to a
 *  fresh measurement node so several metrics coexist on one dataset. */
function measurement(slug: string, metric: string, value: string): string {
  const measurementNode = `${base(slug)}/measurement/${metric}`;
  return `
    <${base(slug)}> <${DQV}hasQualityMeasurement> <${measurementNode}> .
    <${measurementNode}> <${DQV}isMeasurementOf> <${METRIC}${metric}> ;
      <${DQV}value> ${value} .`;
}

/** Seed the DKG store with the NDE compatibility DQV measurements (and the IIIF
 *  subset) so every “vinkje” boolean is exercised for one dataset. */
function dqvInsertQuery(slug: string): string {
  const iri = base(slug);
  const iiifSubset = `${iri}/subset/iiif`;
  return `INSERT DATA {
    <${iri}> <${VOID}subset> <${iiifSubset}> .
    <${iiifSubset}> <${DCT}conformsTo> <${IIIF_PRESENTATION_API}> ;
      <${VOID}entities> 5 .
    ${measurement(slug, 'manifests-sampled', '3')}
    ${measurement(slug, 'manifests-validated', '2')}
    ${measurement(slug, 'quads-validated', '42')}
    ${measurement(slug, 'schema-ap-nde-sample-conformance', `"true"^^<${XSD_BOOLEAN}>`)}
    ${measurement(slug, 'subject-uris-sampled', '10')}
    ${measurement(slug, 'subject-uris-resolved', '10')}
  }`;
}

describe('runIndex acceptance (QLever + Typesense)', () => {
  const qlever = new QLeverContainer();
  const dkg = new QLeverContainer();
  const typesense = new TypesenseContainer();
  let client: Client;
  let connection: TypesenseConnection;
  let sparqlUrl: string;
  let knowledgeGraphUrl: string;

  beforeAll(async () => {
    sparqlUrl = await qlever.start();
    knowledgeGraphUrl = await dkg.start();
    connection = await typesense.start();
    client = createTypesenseClient(connection);

    const sparql = new SparqlClient(sparqlUrl, qlever.accessToken);
    for (const seed of SEEDS) {
      await sparql.update(insertQuery(seed));
    }

    const dkgSparql = new SparqlClient(knowledgeGraphUrl, dkg.accessToken);
    await dkgSparql.update(dkgInsertQuery('mohlmann', [PERSON_CLASS]));
    await dkgSparql.update(
      dkgInsertQuery('fietsen-title', ['http://example.org/UngroupedThing']),
    );
    await dkgSparql.update(`INSERT DATA {
      <${base('mohlmann')}> a <http://rdfs.org/ns/void#Dataset> ;
        <http://rdfs.org/ns/void#triples> 12345 .
      <${base('mohlmann')}/linkset/aat> a <http://rdfs.org/ns/void#Linkset> ;
        <http://rdfs.org/ns/void#subjectsTarget> <${base('mohlmann')}> ;
        <http://rdfs.org/ns/void#objectsTarget> <${AAT}> .
      <${AAT}> <http://purl.org/dc/terms/title> "Art & Architecture Thesaurus" .
      <${PERSON_CLASS}> <http://www.w3.org/2000/01/rdf-schema#label> "Person"@en .
    }`);

    // NDE compatibility (“vinkjes”) DQV measurements for mohlmann: every
    // criterion met. IIIF subset declares manifests and a sampled one validated;
    // SCHEMA-AP-NDE validated quads and conformed (drives nde_schema_ap and,
    // together with void:triples above, linked_data); the terminology-source
    // linkset above drives terms; all sampled subject URIs resolved with no
    // non-durable flag, driving persistent_uris.
    await dkgSparql.update(dqvInsertQuery('mohlmann'));

    await runIndex({
      sparqlUrl,
      sparqlAccessToken: qlever.accessToken,
      registrationsGraphIri: REGISTRATIONS_GRAPH,
      knowledgeGraphEndpoint: knowledgeGraphUrl,
      typesense: connection,
    });
  }, 240_000);

  afterAll(async () => {
    await Promise.all([qlever.stop(), dkg.stop(), typesense.stop()]);
  });

  async function search(
    text: string,
    extra: Partial<SearchParams<object>> = {},
  ): Promise<string[]> {
    const params: SearchParams<object> = {
      q: fold(text),
      query_by: queryBy(),
      query_by_weights: queryByWeights(),
      per_page: 50,
      ...extra,
    };
    const response = await client
      .collections(SEARCH_COLLECTION_ALIAS)
      .documents()
      .search(params);
    return (response.hits ?? []).map(
      (hit) => (hit.document as { id: string }).id,
    );
  }

  it('indexed every registered dataset', async () => {
    const collection = await client
      .collections(SEARCH_COLLECTION_ALIAS)
      .retrieve();
    expect(collection.num_documents).toBe(SEEDS.length);
  });

  it('finds Møhlmann when searching “Mohlmann” and vice versa (#1661)', async () => {
    expect(await search('Mohlmann')).toContain(base('mohlmann'));
    expect(await search('Møhlmann')).toContain(base('mohlmann'));
  });

  it('tolerates a typo (#1684 fuzzy)', async () => {
    expect(await search('mohlman')).toContain(base('mohlmann'));
  });

  it('matches non-adjacent multi-word queries across title and description (#2071)', async () => {
    expect(await search('verhaal utrecht')).toContain(base('verhaal-utrecht'));
    expect(await search('platform utrecht')).toContain(base('verhaal-utrecht'));
  });

  it('matches Dutch inflections via stemming (#2071)', async () => {
    expect(await search('verhalen')).toContain(base('verhaal-utrecht'));
  });

  it('treats persoon/person as synonyms (#1684)', async () => {
    expect(await search('person')).toContain(base('persoon'));
  });

  it('ranks a title match above a description match (#1684 weighting)', async () => {
    const ids = await search('fietsen', { filter_by: 'status:=valid' });
    const titleRank = ids.indexOf(base('fietsen-title'));
    const descriptionRank = ids.indexOf(base('fietsen-desc'));
    expect(titleRank).toBeGreaterThanOrEqual(0);
    expect(descriptionRank).toBeGreaterThan(titleRank);
  });

  it('supports the default valid-status filter', async () => {
    expect(await search('fietsen')).toContain(base('gone-fietsen'));
    expect(
      await search('fietsen', { filter_by: 'status:=valid' }),
    ).not.toContain(base('gone-fietsen'));
  });

  it('projects DCAT distribution formats and the combined publisher facet', async () => {
    const document = (await client
      .collections(SEARCH_COLLECTION_ALIAS)
      .documents(base('mohlmann'))
      .retrieve()) as Record<string, unknown>;
    expect(document.format).toEqual(['text/turtle']);
    expect(document.format_group).toEqual(
      expect.arrayContaining(['group:rdf', 'group:sparql']),
    );
    // The publisher facet merges dct:publisher and dct:creator organizations.
    expect(document.publisher).toEqual(
      expect.arrayContaining([
        'https://example.org/org/kb',
        'https://example.org/org/na',
      ]),
    );
    expect(document.status).toBe('valid');
  });

  it('builds the sidecar labels collection from publisher and creator org names', async () => {
    const publisher = (await client
      .collections(LABELS_COLLECTION_ALIAS)
      .documents('https://example.org/org/kb')
      .retrieve()) as Record<string, unknown>;
    expect(publisher.label).toBe('Koninklijke Bibliotheek');
    expect(publisher.type).toBe('organization');

    // Creator organizations are labelled too, not just publishers.
    const creator = (await client
      .collections(LABELS_COLLECTION_ALIAS)
      .documents('https://example.org/org/na')
      .retrieve()) as Record<string, unknown>;
    expect(creator.label).toBe('Nationaal Archief');
  });

  it('labels DKG terminology sources and classes in the sidecar collection', async () => {
    const terminologySource = (await client
      .collections(LABELS_COLLECTION_ALIAS)
      .documents(AAT)
      .retrieve()) as Record<string, unknown>;
    expect(terminologySource.label).toBe('Art & Architecture Thesaurus');
    expect(terminologySource.type).toBe('terminology_source');

    const personClass = (await client
      .collections(LABELS_COLLECTION_ALIAS)
      .documents(PERSON_CLASS)
      .retrieve()) as Record<string, unknown>;
    expect(personClass.label).toBe('Person');
    expect(personClass.label_en).toBe('Person');
    expect(personClass.type).toBe('class');
  });

  it('returns native facet counts', async () => {
    const response = await client
      .collections(SEARCH_COLLECTION_ALIAS)
      .documents()
      .search({
        q: '*',
        query_by: queryBy(),
        facet_by: 'status',
        per_page: 0,
      });
    const statusFacet = response.facet_counts?.find(
      (facet) => facet.field_name === 'status',
    );
    const valid = statusFacet?.counts.find((count) => count.value === 'valid');
    expect(valid?.count).toBe(SEEDS.length - 1);
  });

  it('enriches a document with the DKG class facet, joined by dataset IRI', async () => {
    const document = (await client
      .collections(SEARCH_COLLECTION_ALIAS)
      .documents(base('mohlmann'))
      .retrieve()) as Record<string, unknown>;
    expect(document.class).toEqual([PERSON_CLASS]);
  });

  it('derives the class_group facet from DKG classes at index time', async () => {
    const document = (await client
      .collections(SEARCH_COLLECTION_ALIAS)
      .documents(base('mohlmann'))
      .retrieve()) as Record<string, unknown>;
    expect(document.class_group).toEqual(['group:person']);
  });

  it('enriches a document with DKG terminology sources (void:Linkset)', async () => {
    const document = (await client
      .collections(SEARCH_COLLECTION_ALIAS)
      .documents(base('mohlmann'))
      .retrieve()) as Record<string, unknown>;
    expect(document.terminology_source).toEqual([AAT]);
  });

  it('enriches a document with the DKG size (void:triples)', async () => {
    const document = (await client
      .collections(SEARCH_COLLECTION_ALIAS)
      .documents(base('mohlmann'))
      .retrieve()) as Record<string, unknown>;
    expect(document.size).toBe(12345);
  });

  it('derives the NDE compatibility booleans from DKG DQV measurements', async () => {
    const met = (await client
      .collections(SEARCH_COLLECTION_ALIAS)
      .documents(base('mohlmann'))
      .retrieve()) as Record<string, unknown>;
    expect(met.iiif).toBe(true);
    expect(met.nde_schema_ap).toBe(true);
    expect(met.linked_data).toBe(true);
    expect(met.terms).toBe(true);
    expect(met.persistent_uris).toBe(true);

    // A dataset without DQV measurements has no compatibility booleans set.
    const unmet = (await client
      .collections(SEARCH_COLLECTION_ALIAS)
      .documents(base('fietsen-title'))
      .retrieve()) as Record<string, unknown>;
    expect(unmet.iiif).toBeUndefined();
    expect(unmet.nde_schema_ap).toBeUndefined();
    expect(unmet.linked_data).toBeUndefined();
    expect(unmet.terms).toBeUndefined();
    expect(unmet.persistent_uris).toBeUndefined();
  });

  it('counts compliant datasets via a native boolean facet', async () => {
    const response = await client
      .collections(SEARCH_COLLECTION_ALIAS)
      .documents()
      .search({
        q: '*',
        query_by: queryBy(),
        facet_by: 'iiif',
        per_page: 0,
      });
    const iiifFacet = response.facet_counts?.find(
      (facet) => facet.field_name === 'iiif',
    );
    const compliant = iiifFacet?.counts.find((count) => count.value === 'true');
    expect(compliant?.count).toBe(1);
  });

  it('sets the granular class but no class_group for an ungrouped class', async () => {
    const document = (await client
      .collections(SEARCH_COLLECTION_ALIAS)
      .documents(base('fietsen-title'))
      .retrieve()) as Record<string, unknown>;
    expect(document.class).toEqual(['http://example.org/UngroupedThing']);
    expect(document.class_group).toBeUndefined();
  });

  it('releases the per-index rebuild lock so a back-to-back run succeeds', async () => {
    const options = {
      sparqlUrl,
      sparqlAccessToken: qlever.accessToken,
      registrationsGraphIri: REGISTRATIONS_GRAPH,
      knowledgeGraphEndpoint: knowledgeGraphUrl,
      typesense: connection,
    };
    expect((await runIndex(options)).mode).toBe('rebuild');
    // A second sequential run proves the indexer’s lock was released (no deadlock).
    expect((await runIndex(options)).mode).toBe('rebuild');

    const collection = await client
      .collections(SEARCH_COLLECTION_ALIAS)
      .retrieve();
    expect(collection.num_documents).toBe(SEEDS.length);
    expect(await search('Mohlmann')).toContain(base('mohlmann'));
  });

  // Runs before the final rebuild: a failed DKG read must not abort the rebuild.
  it('rebuilds register data even when the DKG endpoint is unreachable', async () => {
    const result = await runIndex({
      sparqlUrl,
      sparqlAccessToken: qlever.accessToken,
      registrationsGraphIri: REGISTRATIONS_GRAPH,
      knowledgeGraphEndpoint: 'http://127.0.0.1:1/',
      typesense: connection,
    });

    // Register correctness lands; DKG facets are simply absent this run.
    expect(result.mode).toBe('rebuild');
    expect(await search('Mohlmann')).toContain(base('mohlmann'));
    const document = (await client
      .collections(SEARCH_COLLECTION_ALIAS)
      .documents(base('mohlmann'))
      .retrieve()) as Record<string, unknown>;
    expect(document.class).toBeUndefined();
  });

  // Runs last: it mutates the store, then a full rebuild re-derives the index.
  it('reflects added and removed datasets after a full rebuild', async () => {
    const sparql = new SparqlClient(sparqlUrl, qlever.accessToken);

    // Add a brand-new dataset.
    await sparql.update(`
      INSERT DATA {
        GRAPH <${base('rebuild-new')}> {
          <${base('rebuild-new')}> a <http://www.w3.org/ns/dcat#Dataset> ;
            <http://purl.org/dc/terms/title> "Nieuwe toevoeging"@nl .
        }
        GRAPH <${REGISTRATIONS_GRAPH}> {
          <${base('rebuild-new')}/registration> a <https://schema.org/EntryPoint> ;
            <https://schema.org/about> <${base('rebuild-new')}> ;
            <https://schema.org/datePosted> "2024-05-01T00:00:00.000Z"^^<http://www.w3.org/2001/XMLSchema#dateTime> ;
            <https://schema.org/dateRead> "2024-05-01T00:00:00.000Z"^^<http://www.w3.org/2001/XMLSchema#dateTime> .
        }
      }`);

    // Remove an existing dataset’s registration so it is no longer enumerated.
    await sparql.update(`
      DELETE WHERE {
        GRAPH <${REGISTRATIONS_GRAPH}> {
          <${base('persoon')}/registration> ?p ?o .
        }
      }`);

    const result = await runIndex({
      sparqlUrl,
      sparqlAccessToken: qlever.accessToken,
      registrationsGraphIri: REGISTRATIONS_GRAPH,
      typesense: connection,
    });

    // A blue/green rebuild re-derives the whole collection from canonical RDF:
    // the new dataset is present and the removed one is simply not projected —
    // a hard delete needs no special-case handling.
    expect(result.mode).toBe('rebuild');
    expect(await search('Nieuwe')).toContain(base('rebuild-new'));
    expect(await search('persoon')).not.toContain(base('persoon'));
  });
});
