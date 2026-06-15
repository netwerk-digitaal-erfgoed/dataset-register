/**
 * Read-throughput benchmark: current batched-SELECT reader vs. a single
 * CONSTRUCT read, plus the JSON-LD framing cost that Phase 5 would add on top of
 * the CONSTRUCT path. Informs whether the Phase 5 two-CONSTRUCT read fits the
 * full-rebuild window (~2,500 datasets, target ≤~30s) before we commit to it.
 *
 * NOT part of the normal suite: gated behind BENCH=1 and meant to be run with
 * coverage disabled so it never touches the autoUpdate thresholds, e.g.
 *
 *   BENCH=1 npx nx test @dataset-register/search-indexer -- \
 *     --run --coverage.enabled=false read-throughput
 *
 * Tune scale with BENCH_N (default 2500).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Parser, Writer } from 'n3';
import type { Quad } from '@rdfjs/types';
import jsonld from 'jsonld';
import { SparqlClient } from '@dataset-register/core';
import { buildDocument, type LangValue } from '../src/projection.ts';
import { RegisterSource } from '../src/register-source.ts';
import { QLeverContainer } from './qlever-container.ts';

const REGISTRATIONS_GRAPH = 'https://example.org/registry/registrations';
const STATUS_BASE = 'https://data.netwerkdigitaalerfgoed.nl/registry/';
const IANA = 'https://www.iana.org/assignments/media-types/';
const SPARQL_PROTOCOL = 'https://www.w3.org/TR/sparql11-protocol/';
const DATASET_COUNT = Number(process.env.BENCH_N ?? 2500);
const LOAD_BATCH = 250;
/** Per-dataset frames timed before extrapolating to the full corpus. */
const SAMPLE = Number(process.env.BENCH_SAMPLE ?? 300);
/** In-flight per-dataset CONSTRUCTs for the iterator-executor path. */
const CONCURRENCY = Number(process.env.BENCH_CONCURRENCY ?? 16);
/** Dataset IRIs per batched CONSTRUCT (Path E). */
const CONSTRUCT_BATCH = Number(process.env.BENCH_CONSTRUCT_BATCH ?? 250);

const dataset = (index: number) => `https://example.org/dataset/${index}`;
const org = (index: number) => `https://example.org/org/${index % 50}`;

/** ~20 triples across the dataset graph + registrations graph, multilingual and
 *  multi-valued like a real harvested catalogue, so the SELECT cross-product and
 *  the CONSTRUCT payload both reflect production shape. */
function datasetTriples(index: number): string {
  const iri = dataset(index);
  const publisher = org(index);
  const description =
    'Een uitgebreide beschrijving met genoeg tekst om het ' +
    'transfervolume realistisch te houden voor dataset ' +
    index +
    ', inclusief allerlei termen over erfgoed, archief en collectie.';
  const status =
    index % 17 === 0 ? `gone` : index % 11 === 0 ? `invalid` : undefined;
  return `
    GRAPH <${iri}> {
      <${iri}> a <http://www.w3.org/ns/dcat#Dataset> ;
        <http://purl.org/dc/terms/title> "Titel ${index}"@nl, "Title ${index}"@en ;
        <http://purl.org/dc/terms/description> "${description}"@nl, "Description ${index} about heritage, archives and collections."@en ;
        <http://purl.org/dc/terms/publisher> <${publisher}> ;
        <http://purl.org/dc/terms/creator> <${iri}/creator> ;
        <http://www.w3.org/ns/dcat#keyword> "erfgoed"@nl, "archief"@nl, "collectie"@nl, "heritage"@en, "archive"@en ;
        <http://purl.org/dc/terms/language> "nl", "en" ;
        <http://www.w3.org/ns/dcat#distribution> <${iri}/dist/1>, <${iri}/dist/2> .
      <${publisher}> <http://xmlns.com/foaf/0.1/name> "Erfgoedinstelling ${index % 50}"@nl .
      <${iri}/creator> <http://xmlns.com/foaf/0.1/name> "Maker ${index}"@nl .
      <${iri}/dist/1> a <http://www.w3.org/ns/dcat#Distribution> ;
        <http://www.w3.org/ns/dcat#mediaType> <${IANA}text/turtle> ;
        <http://purl.org/dc/terms/conformsTo> <${SPARQL_PROTOCOL}> .
      <${iri}/dist/2> a <http://www.w3.org/ns/dcat#Distribution> ;
        <http://www.w3.org/ns/dcat#mediaType> <${IANA}application/ld+json> .
    }
    GRAPH <${REGISTRATIONS_GRAPH}> {
      <${iri}/registration> a <https://schema.org/EntryPoint> ;
        <https://schema.org/about> <${iri}> ;
        <https://schema.org/datePosted> "2024-01-01T00:00:00.000Z"^^<http://www.w3.org/2001/XMLSchema#dateTime> ;
        <https://schema.org/dateRead> "2024-02-01T00:00:00.000Z"^^<http://www.w3.org/2001/XMLSchema#dateTime>${
          status
            ? ` ;\n        <https://schema.org/additionalType> <${STATUS_BASE}${status}>`
            : ''
        } .
    }`;
}

/** Flattened CONSTRUCT mirroring the SELECT's UNION arms, but in one query: each
 *  field value hangs directly off the dataset so projection is trivial and the
 *  output cardinality matches the SELECT path. With a `VALUES` clause it scopes
 *  to a batch of dataset IRIs (Path E); without, it covers the whole register
 *  (Path B). */
function flatConstruct(valuesClause = ''): string {
  return `
  PREFIX schema: <https://schema.org/>
  PREFIX dcat: <http://www.w3.org/ns/dcat#>
  PREFIX dct: <http://purl.org/dc/terms/>
  PREFIX foaf: <http://xmlns.com/foaf/0.1/>
  PREFIX b: <urn:bench:>
  CONSTRUCT {
    ?dataset b:title ?title ; b:description ?description ; b:keyword ?keyword ;
      b:language ?language ; b:publisherName ?publisherName ; b:publisherIri ?publisherIri ;
      b:creatorName ?creatorName ; b:mediaType ?mediaType ; b:conformsTo ?conformsTo ;
      b:dateRead ?dateRead ; b:datePosted ?datePosted ; b:validUntil ?validUntil ;
      b:additionalType ?additionalType .
  } WHERE {
    ${valuesClause}
    GRAPH <${REGISTRATIONS_GRAPH}> { ?reg schema:about ?dataset . }
    {
      GRAPH <${REGISTRATIONS_GRAPH}> { ?reg schema:dateRead ?dateRead . }
    } UNION { GRAPH <${REGISTRATIONS_GRAPH}> { ?reg schema:datePosted ?datePosted } }
      UNION { GRAPH <${REGISTRATIONS_GRAPH}> { ?reg schema:validUntil ?validUntil } }
      UNION { GRAPH <${REGISTRATIONS_GRAPH}> { ?reg schema:additionalType ?additionalType } }
      UNION { GRAPH ?dataset { ?dataset dct:title ?title } }
      UNION { GRAPH ?dataset { ?dataset dct:description ?description } }
      UNION { GRAPH ?dataset { ?dataset dcat:keyword ?keyword } }
      UNION { GRAPH ?dataset { ?dataset dct:language ?lang BIND(STR(?lang) AS ?language) } }
      UNION { GRAPH ?dataset { ?dataset dct:publisher/foaf:name ?publisherName } }
      UNION { GRAPH ?dataset { ?dataset dct:publisher ?p FILTER(isIRI(?p)) BIND(STR(?p) AS ?publisherIri) } }
      UNION { GRAPH ?dataset { ?dataset dct:creator/foaf:name ?creatorName } }
      UNION { GRAPH ?dataset { ?dataset dcat:distribution/dcat:mediaType ?m BIND(STR(?m) AS ?mediaType) } }
      UNION { GRAPH ?dataset { ?dataset dcat:distribution/dct:conformsTo ?c BIND(STR(?c) AS ?conformsTo) } }
  }`;
}

/** Canonical, nested CONSTRUCT (publisher/creator/distribution as their own
 *  nodes) — the shape jsonld.frame() must walk, used only for the framing cost. */
const CONSTRUCT_NESTED = `
  PREFIX schema: <https://schema.org/>
  PREFIX dcat: <http://www.w3.org/ns/dcat#>
  PREFIX dct: <http://purl.org/dc/terms/>
  PREFIX foaf: <http://xmlns.com/foaf/0.1/>
  PREFIX dr: <urn:dr:>
  CONSTRUCT {
    ?dataset a dcat:Dataset ;
      dct:title ?title ; dct:description ?description ; dcat:keyword ?keyword ;
      dct:language ?language ; dct:publisher ?publisher ; dct:creator ?creator ;
      dcat:distribution ?dist ; schema:additionalType ?additionalType ;
      dr:dateRead ?dateRead ; dr:datePosted ?datePosted ; dr:validUntil ?validUntil .
    ?publisher foaf:name ?publisherName .
    ?creator foaf:name ?creatorName .
    ?dist dcat:mediaType ?mediaType ; dct:conformsTo ?conformsTo .
  } WHERE {
    GRAPH <${REGISTRATIONS_GRAPH}> { ?reg a schema:EntryPoint ; schema:about ?dataset . }
    {
      GRAPH <${REGISTRATIONS_GRAPH}> { ?reg schema:dateRead ?dateRead . }
    } UNION { GRAPH <${REGISTRATIONS_GRAPH}> { ?reg schema:datePosted ?datePosted } }
      UNION { GRAPH <${REGISTRATIONS_GRAPH}> { ?reg schema:additionalType ?additionalType } }
      UNION { GRAPH ?dataset { ?dataset dct:title ?title } }
      UNION { GRAPH ?dataset { ?dataset dct:description ?description } }
      UNION { GRAPH ?dataset { ?dataset dcat:keyword ?keyword } }
      UNION { GRAPH ?dataset { ?dataset dct:language ?language } }
      UNION { GRAPH ?dataset { ?dataset dct:publisher ?publisher OPTIONAL { ?publisher foaf:name ?publisherName } } }
      UNION { GRAPH ?dataset { ?dataset dct:creator ?creator OPTIONAL { ?creator foaf:name ?creatorName } } }
      UNION { GRAPH ?dataset { ?dataset dcat:distribution ?dist
              OPTIONAL { ?dist dcat:mediaType ?mediaType } OPTIONAL { ?dist dct:conformsTo ?conformsTo } } }
  }`;

const FRAME = {
  '@context': {
    dcat: 'http://www.w3.org/ns/dcat#',
    dct: 'http://purl.org/dc/terms/',
    foaf: 'http://xmlns.com/foaf/0.1/',
  },
  '@type': 'dcat:Dataset',
};

/** A lean CONSTRUCT scoped to a single dataset IRI (iterator-executor path):
 *  one triple per UNION arm, constant subject, so the payload is just this
 *  dataset's values and QLever has nothing to duplicate. */
function perDatasetConstruct(iri: string): string {
  return `
    PREFIX schema: <https://schema.org/>
    PREFIX dcat: <http://www.w3.org/ns/dcat#>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX b: <urn:bench:>
    CONSTRUCT {
      <${iri}> b:title ?title ; b:description ?description ; b:keyword ?keyword ;
        b:language ?language ; b:publisherName ?publisherName ; b:publisherIri ?publisherIri ;
        b:creatorName ?creatorName ; b:mediaType ?mediaType ; b:conformsTo ?conformsTo ;
        b:dateRead ?dateRead ; b:datePosted ?datePosted ; b:validUntil ?validUntil ;
        b:additionalType ?additionalType .
    } WHERE {
      {
        GRAPH <${REGISTRATIONS_GRAPH}> { ?reg schema:about <${iri}> ; schema:dateRead ?dateRead . }
      } UNION { GRAPH <${REGISTRATIONS_GRAPH}> { ?reg schema:about <${iri}> ; schema:datePosted ?datePosted } }
        UNION { GRAPH <${REGISTRATIONS_GRAPH}> { ?reg schema:about <${iri}> ; schema:validUntil ?validUntil } }
        UNION { GRAPH <${REGISTRATIONS_GRAPH}> { ?reg schema:about <${iri}> ; schema:additionalType ?additionalType } }
        UNION { GRAPH <${iri}> { <${iri}> dct:title ?title } }
        UNION { GRAPH <${iri}> { <${iri}> dct:description ?description } }
        UNION { GRAPH <${iri}> { <${iri}> dcat:keyword ?keyword } }
        UNION { GRAPH <${iri}> { <${iri}> dct:language ?lang BIND(STR(?lang) AS ?language) } }
        UNION { GRAPH <${iri}> { <${iri}> dct:publisher/foaf:name ?publisherName } }
        UNION { GRAPH <${iri}> { <${iri}> dct:publisher ?p FILTER(isIRI(?p)) BIND(STR(?p) AS ?publisherIri) } }
        UNION { GRAPH <${iri}> { <${iri}> dct:creator/foaf:name ?creatorName } }
        UNION { GRAPH <${iri}> { <${iri}> dcat:distribution/dcat:mediaType ?m BIND(STR(?m) AS ?mediaType) } }
        UNION { GRAPH <${iri}> { <${iri}> dcat:distribution/dct:conformsTo ?c BIND(STR(?c) AS ?conformsTo) } }
    }`;
}

/** Run `fn` over `items` with at most `limit` promises in flight, preserving
 *  order — the bounded-concurrency core of an iterator-executor. */
async function mapWithConcurrency<Item, Result>(
  items: readonly Item[],
  limit: number,
  fn: (item: Item) => Promise<Result>,
): Promise<Result[]> {
  const results: Result[] = new Array(items.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]!);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

/** Run `query` against QLever's HTTP SPARQL endpoint in a single round trip,
 *  returning the response body as N-Triples. */
async function constructOverHttp(
  endpoint: string,
  query: string,
): Promise<string> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/sparql-query',
      Accept: 'application/n-triples',
    },
    body: query,
  });
  if (!response.ok) {
    throw new Error(`CONSTRUCT failed: ${response.status} ${await response.text()}`);
  }
  return await response.text();
}

const BENCH = process.env.BENCH === '1';

describe.runIf(BENCH)('read throughput: SELECT vs CONSTRUCT', () => {
  const qlever = new QLeverContainer();
  let endpoint: string;

  beforeAll(async () => {
    endpoint = await qlever.start();
    const sparql = new SparqlClient(endpoint, qlever.accessToken);
    const loadStart = performance.now();
    for (let offset = 0; offset < DATASET_COUNT; offset += LOAD_BATCH) {
      const triples: string[] = [];
      for (
        let index = offset;
        index < Math.min(offset + LOAD_BATCH, DATASET_COUNT);
        index++
      ) {
        triples.push(datasetTriples(index));
      }
      await sparql.update(`INSERT DATA {${triples.join('\n')}}`);
    }
    log(
      `loaded ${DATASET_COUNT} datasets in ${seconds(performance.now() - loadStart)}`,
    );
  }, 600_000);

  afterAll(async () => {
    await qlever.stop();
  });

  it('measures both read paths', async () => {
    // --- Path A: current batched-SELECT reader (via comunica) ---
    const requestsA = countEndpointRequests(endpoint);
    const startA = performance.now();
    const source = new RegisterSource(
      new SparqlClient(endpoint, qlever.accessToken),
      REGISTRATIONS_GRAPH,
    );
    const irisA = await source.enumerateDatasetIris();
    const documentsA = await source.project(irisA);
    const elapsedA = performance.now() - startA;
    const httpA = requestsA.stop();

    // --- Path B: single CONSTRUCT over HTTP, n3 parse, same projection ---
    const startB = performance.now();
    const ntriples = await constructOverHttp(endpoint, flatConstruct());
    const afterFetchB = performance.now();
    const documentsB = projectFromFlatTriples(ntriples);
    const elapsedB = performance.now() - startB;

    // --- Path C: CONSTRUCT (nested) → JSON-LD framing, per-dataset (chunked) ---
    // Whole-graph jsonld.frame() is ~O(N²) (measured 367s at 2,500), so frame
    // each dataset's own subgraph independently to keep it linear.
    const startC = performance.now();
    const nestedTriples = await constructOverHttp(endpoint, CONSTRUCT_NESTED);
    const afterFetchC = performance.now();
    const subgraphs = groupBySubject(nestedTriples);
    const afterGroupC = performance.now();
    // Per-dataset framing is independent and uniform, so time a representative
    // sample and extrapolate (framing all 2,500 in one process OOMs jsonld@9).
    const sample = Math.min(SAMPLE, subgraphs.length);
    const startSample = performance.now();
    for (let index = 0; index < sample; index++) {
      const expanded = await jsonld.fromRDF(await writeNTriples(subgraphs[index]!), {
        format: 'application/n-quads',
      });
      await jsonld.frame(expanded, FRAME);
    }
    const samplePerDataset = (performance.now() - startSample) / sample;

    // --- Path D: per-dataset CONSTRUCT, bounded concurrency (LDE iterator-executor) ---
    // SELECT all URIs once, then one lean CONSTRUCT per dataset with K in flight.
    // Bounds payload + memory per request and scales past a single in-memory
    // graph, at the cost of N+1 round trips (amortised by concurrency).
    const startD = performance.now();
    const sourceD = new RegisterSource(
      new SparqlClient(endpoint, qlever.accessToken),
      REGISTRATIONS_GRAPH,
    );
    const irisD = await sourceD.enumerateDatasetIris();
    const documentsD = await mapWithConcurrency(irisD, CONCURRENCY, async (iri) => {
      const ntriplesForDataset = await constructOverHttp(
        endpoint,
        perDatasetConstruct(iri),
      );
      return projectFromFlatTriples(ntriplesForDataset)[0];
    });
    const elapsedD = performance.now() - startD;

    // --- Path E: batched CONSTRUCT (iterator-executor yielding URI chunks) ---
    // The middle ground: SELECT URIs once, then one CONSTRUCT per batch scoped by
    // VALUES. Bounds payload/memory per request like Path D, but only ⌈N/batch⌉
    // round trips like the current SELECT.
    const startE = performance.now();
    const sourceE = new RegisterSource(
      new SparqlClient(endpoint, qlever.accessToken),
      REGISTRATIONS_GRAPH,
    );
    const irisE = await sourceE.enumerateDatasetIris();
    const documentsE: unknown[] = [];
    let batchesE = 0;
    for (let offset = 0; offset < irisE.length; offset += CONSTRUCT_BATCH) {
      const batch = irisE.slice(offset, offset + CONSTRUCT_BATCH);
      const values = `VALUES ?dataset { ${batch.map((iri) => `<${iri}>`).join(' ')} }`;
      const batchTriples = await constructOverHttp(endpoint, flatConstruct(values));
      documentsE.push(...projectFromFlatTriples(batchTriples));
      batchesE++;
    }
    const elapsedE = performance.now() - startE;

    log('');
    log(`results for ${DATASET_COUNT} datasets`);
    log('───────────────────────────────────────────────');
    log(
      `A SELECT (current)        ${seconds(elapsedA)}  docs=${documentsA.length}  http=${httpA}`,
    );
    log(
      `B CONSTRUCT+project       ${seconds(elapsedB)}  docs=${documentsB.length}  http=1` +
        `  (fetch ${seconds(afterFetchB - startB)}, parse+project ${seconds(elapsedB - (afterFetchB - startB))}, ${Math.round(ntriples.length / 1024)} KiB)`,
    );
    log(
      `C CONSTRUCT+frame per-ds  ${seconds(samplePerDataset * subgraphs.length)} projected` +
        `  (sample ${sample}: ${samplePerDataset.toFixed(2)}ms/dataset; fetch ${seconds(afterFetchC - startC)}, group ${seconds(afterGroupC - afterFetchC)}, nested ${Math.round(nestedTriples.length / 1024)} KiB — QLever does not dedupe CONSTRUCT)`,
    );
    log('  (whole-graph jsonld.frame() measured separately at 367s — ~O(N²))');
    log(
      `D CONSTRUCT per-dataset   ${seconds(elapsedD)}  docs=${documentsD.length}  http=${irisD.length + 1}  (concurrency ${CONCURRENCY}, bounded payload/memory)`,
    );
    log(
      `E CONSTRUCT batched       ${seconds(elapsedE)}  docs=${documentsE.length}  http=${batchesE + 1}  (batch ${CONSTRUCT_BATCH}, bounded payload/memory)`,
    );
    log('───────────────────────────────────────────────');

    // The CONSTRUCT paths must read the same datasets as the SELECT path.
    expect(documentsA.length).toBe(DATASET_COUNT);
    const idsA = documentsA.map((document) => document.id).sort();
    const idsB = (documentsB as { id: string }[])
      .map((document) => document.id)
      .sort();
    expect(idsB).toEqual(idsA);
    const idsD = (documentsD as { id: string }[])
      .map((document) => document.id)
      .sort();
    expect(idsD).toEqual(idsA);
    const idsE = (documentsE as { id: string }[])
      .map((document) => document.id)
      .sort();
    expect(idsE).toEqual(idsA);
  }, 600_000);
});

/** Group the flattened `urn:bench:` triples by dataset and project them through
 *  the production buildDocument, so Path B ends where Path A ends. */
function projectFromFlatTriples(ntriples: string): unknown[] {
  const quads = new Parser({ format: 'N-Triples' }).parse(ntriples);
  const raws = new Map<string, MutableRaw>();
  for (const quad of quads) {
    const iri = quad.subject.value;
    const field = quad.predicate.value.replace('urn:bench:', '');
    const raw = raws.get(iri) ?? emptyRaw(iri);
    const value = quad.object.value;
    const lang = quad.object.termType === 'Literal' ? quad.object.language : '';
    switch (field) {
      case 'title':
        raw.titles.push({ value, lang });
        break;
      case 'description':
        raw.descriptions.push({ value, lang });
        break;
      case 'publisherName':
        raw.publisherNames.push({ value, lang });
        break;
      case 'creatorName':
        raw.creatorNames.push({ value, lang });
        break;
      case 'keyword':
        raw.keywords.push({ value, lang });
        break;
      case 'language':
        raw.languages.push(value);
        break;
      case 'publisherIri':
        raw.publisherIris.push(value);
        break;
      case 'mediaType':
        raw.mediaTypes.push(value);
        break;
      case 'conformsTo':
        raw.conformsTo.push(value);
        break;
      case 'additionalType':
        raw.additionalTypes.push(value);
        break;
      case 'dateRead':
        raw.dateReadIso = value;
        break;
      case 'datePosted':
        raw.datePostedIso = value;
        break;
      case 'validUntil':
        raw.validUntilIso = value;
        break;
    }
    raws.set(iri, raw);
  }
  return [...raws.values()].map((raw) => buildDocument(raw));
}

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const DCAT_DATASET = 'http://www.w3.org/ns/dcat#Dataset';

/** Split the nested CONSTRUCT result into one self-contained quad subgraph per
 *  dataset (its own triples plus the one-hop publisher/creator/distribution
 *  nodes it references), so each can be framed in isolation. Returns quad arrays
 *  (cheap references); serialization happens one at a time during framing to
 *  bound memory. */
function groupBySubject(ntriples: string): Quad[][] {
  const quads = new Parser({ format: 'N-Triples' }).parse(ntriples);
  const bySubject = new Map<string, Quad[]>();
  const datasetIris = new Set<string>();
  // QLever does not dedupe CONSTRUCT output, so dedupe S/P/O/lang here.
  const seen = new Set<string>();
  for (const quad of quads) {
    const key = `${quad.subject.value}|${quad.predicate.value}|${quad.object.value}|${quad.object.termType === 'Literal' ? quad.object.language : ''}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const subject = quad.subject.value;
    (bySubject.get(subject) ?? setGet(bySubject, subject)).push(quad);
    if (quad.predicate.value === RDF_TYPE && quad.object.value === DCAT_DATASET) {
      datasetIris.add(subject);
    }
  }
  return [...datasetIris].map((iri) => {
    const own = bySubject.get(iri) ?? [];
    const referenced = own
      .filter((quad) => quad.object.termType === 'NamedNode')
      .flatMap((quad) => bySubject.get(quad.object.value) ?? []);
    return [...own, ...referenced];
  });
}

function setGet(map: Map<string, Quad[]>, key: string): Quad[] {
  const value: Quad[] = [];
  map.set(key, value);
  return value;
}

function writeNTriples(quads: Quad[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const writer = new Writer({ format: 'N-Triples' });
    writer.addQuads(quads);
    writer.end((error, result) => (error ? reject(error) : resolve(result)));
  });
}

interface MutableRaw {
  iri: string;
  titles: LangValue[];
  descriptions: LangValue[];
  publisherNames: LangValue[];
  creatorNames: LangValue[];
  keywords: LangValue[];
  languages: string[];
  publisherIris: string[];
  mediaTypes: string[];
  conformsTo: string[];
  additionalTypes: string[];
  dateReadIso?: string;
  datePostedIso?: string;
  validUntilIso?: string;
}

function emptyRaw(iri: string): MutableRaw {
  return {
    iri,
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
  };
}

/** Count HTTP requests to the SPARQL endpoint by wrapping global fetch, so the
 *  real round-trip count of the comunica path is observed, not assumed. */
function countEndpointRequests(endpoint: string): { stop: () => number } {
  const original = globalThis.fetch;
  let count = 0;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.startsWith(endpoint)) {
      count++;
    }
    return original(input, init);
  }) as typeof globalThis.fetch;
  return {
    stop: () => {
      globalThis.fetch = original;
      return count;
    },
  };
}

function seconds(millis: number): string {
  return `${(millis / 1000).toFixed(2)}s`;
}

function log(message: string): void {
  console.log(message);
}
