import { dcat } from '@lde/dataset-registry-client';
import { dcterms, foaf } from 'ldkit/namespaces';
import { PUBLIC_KNOWLEDGE_GRAPH_ENDPOINT } from '$env/static/public';
import { schemaNs as schema } from '../rdf.js';
import { getLocale } from '$lib/paraglide/runtime';
import { normalizeMediaType, inLiterals } from '$lib/utils/sparql';
import {
  FORMAT_GROUP_RDF,
  FORMAT_GROUP_SPARQL,
  RDF_MEDIA_TYPES,
  SPARQL_PROTOCOL_URI,
} from '@dataset-register/core/search';
import { REGISTRATION_STATUS_BASE_URI } from '@dataset-register/core/constants';
import { type Facets, fetchFacets } from '$lib/services/facets';
import {
  isSearchConfigured,
  labelResolver,
} from '$lib/services/search/client.js';
import {
  searchDatasets,
  type SearchHitDocument,
  type SearchLocale,
} from '$lib/services/search/datasets.js';

// Base distribution schema with common fields. Retained for the dataset detail
// page (dataset-detail.ts), which still reads distributions over SPARQL.
export const BaseDistributionSchema = {
  '@type': dcat.Distribution,
  mediaType: {
    '@id': dcat.mediaType,
    '@optional': true,
  },
  conformsTo: {
    '@id': dcterms.conformsTo,
    '@array': true,
    '@optional': true,
  },
} as const;

// Base dataset schema with fields shared between card and detail views. Retained
// for the dataset detail page (dataset-detail.ts), which extends it over SPARQL.
export const BaseDatasetSchema = {
  '@type': dcat.Dataset,
  title: {
    '@id': dcterms.title,
    '@multilang': true,
  },
  description: {
    '@id': dcterms.description,
    '@optional': true,
    '@multilang': true,
  },
  language: {
    '@id': dcterms.language,
    '@optional': true,
    '@array': true,
  },
  license: {
    '@id': dcterms.license,
    '@optional': true,
  },
  creator: {
    '@id': dcterms.creator,
    '@optional': true, // But required in DCAT-AP 3.0
    '@array': true,
    '@schema': {
      name: {
        '@id': foaf.name,
        '@multilang': true,
      },
    },
  },
  publisher: {
    '@id': dcterms.publisher,
    '@optional': true,
    '@schema': {
      name: {
        '@id': foaf.name,
        '@multilang': true,
      },
    },
  },
  status: {
    '@id': schema.status,
    '@optional': true,
  },
} as const;

export type OrderBy = 'title' | 'datePosted';

export interface SearchRequest {
  query?: string;
  publisher: string[];
  keyword: string[];
  format: string[];
  class: string[];
  terminologySource: string[];
  catalog: string[];
  size: {
    min?: number;
    max?: number;
  };
  status: string[];
}

/**
 * A single distribution badge on a card: its bare media type (or null) and the
 * `dct:conformsTo` IRIs. Derived from the search document’s `format` and
 * `format_group` fields, mirroring the previous SPARQL-backed shape so the card
 * keeps detecting SPARQL/RDF distributions identically.
 */
export interface CardDistribution {
  mediaType: string | null;
  conformsTo: string[];
}

/**
 * The card view-model, mapped from one Typesense {@link SearchHitDocument}.
 * Multilingual fields are `{nl, en}` records so the card’s `getLocalizedValue`
 * keeps working unchanged.
 */
export interface DatasetCard {
  $id: string;
  title: Record<string, string>;
  description?: Record<string, string>;
  language: string[];
  publisher?: { $id: string; name: Record<string, string> };
  status?: string;
  size?: number;
  datePosted?: Date;
  distribution: CardDistribution[];
  iiif: boolean;
  iiif_manifest_count?: number;
  nde_schema_ap: boolean;
}

// Whether the dataset provides working IIIF media: the DKG validated the
// declared manifests (or none were sampled yet). Indexed as a boolean
// (`iiif === true`); the card gates the icon on this.
export function providesWorkingIiif(dataset: DatasetCard): boolean {
  return dataset.iiif === true;
}

// The declared IIIF manifest count, indexed as `iiif_manifest_count` (sum of the
// IIIF `void:subset` `void:entities`). The card shows the count alongside the
// working-IIIF icon.
export function iiifManifestCount(dataset: DatasetCard): number {
  return dataset.iiif_manifest_count ?? 0;
}

// Whether the dataset conforms to the NDE Schema.org Application Profile in the
// sampled resources. Indexed as a boolean (`nde_schema_ap === true`).
export function conformsToSchemaApNde(dataset: DatasetCard): boolean {
  return dataset.nde_schema_ap === true;
}

export interface SearchResults {
  datasets: DatasetCard[];
  facets: Facets;
  total: number;
  time: number;
}

/**
 * Map a Typesense document to the {@link DatasetCard} view-model. Title and
 * description fall back to the other locale when the active one is missing;
 * publisher IRIs are resolved to labels (both supplied separately because the
 * resolver is async); the distribution badges are reconstructed from the
 * `format`/`format_group` facet fields.
 */
export function cardFromDocument(
  document: SearchHitDocument,
  locale: SearchLocale,
  publisherLabels: { nl: Map<string, string>; en: Map<string, string> },
): DatasetCard {
  const otherLocale: SearchLocale = locale === 'nl' ? 'en' : 'nl';

  // Title is required on the card; a document with neither locale’s title (rare —
  // the index requires a title) degrades to an empty record rather than crashing.
  const title = localizedField(document, 'title', locale, otherLocale) ?? {};
  const description = localizedField(
    document,
    'description',
    locale,
    otherLocale,
  );

  const publisherIris = stringArray(document.publisher);
  const publisher = publisherLabel(publisherIris, publisherLabels);

  return {
    $id: document.id,
    title,
    description,
    language: stringArray(document.language),
    publisher,
    status: typeof document.status === 'string' ? document.status : undefined,
    size: typeof document.size === 'number' ? document.size : undefined,
    datePosted:
      typeof document.date_posted === 'number'
        ? new Date(document.date_posted * 1000)
        : undefined,
    distribution: cardDistributions(document),
    iiif: document.iiif === true,
    iiif_manifest_count:
      typeof document.iiif_manifest_count === 'number'
        ? document.iiif_manifest_count
        : undefined,
    nde_schema_ap: document.nde_schema_ap === true,
  };
}

// A multilingual field reconstructed from the per-locale display fields, keyed by
// the locale codes `getLocalizedValue` expects. Returns undefined when neither
// locale carries a value (so optional fields like description stay absent).
function localizedField(
  document: SearchHitDocument,
  base: string,
  locale: SearchLocale,
  otherLocale: SearchLocale,
): Record<string, string> | undefined {
  const value: Record<string, string> = {};
  const primary = document[`${base}_${locale}`];
  const fallback = document[`${base}_${otherLocale}`];
  if (typeof primary === 'string' && primary.length > 0) {
    value[locale] = primary;
  }
  if (typeof fallback === 'string' && fallback.length > 0) {
    value[otherLocale] = fallback;
  }
  return Object.keys(value).length > 0 ? value : undefined;
}

// Resolve the dataset’s (single, in practice) publisher IRI to a `{nl, en}`
// label record so the card’s getLocalizedValue renders the right language.
// Falls back to the bare IRI when the labels collection has no entry.
function publisherLabel(
  iris: string[],
  labels: { nl: Map<string, string>; en: Map<string, string> },
): { $id: string; name: Record<string, string> } | undefined {
  const iri = iris[0];
  if (iri === undefined) {
    return undefined;
  }
  const name: Record<string, string> = {};
  const nl = labels.nl.get(iri);
  const en = labels.en.get(iri);
  if (nl !== undefined) name.nl = nl;
  if (en !== undefined) name.en = en;
  if (Object.keys(name).length === 0) {
    name[''] = iri;
  }
  return { $id: iri, name };
}

// Rebuild the card’s distribution badges from the search document’s facet
// fields: each granular `format` value becomes a media-type badge, and the
// `group:sparql`/`group:rdf` tokens in `format_group` re-create the conformsTo /
// RDF media-type signals the card looks for.
function cardDistributions(document: SearchHitDocument): CardDistribution[] {
  const distributions: CardDistribution[] = stringArray(document.format).map(
    (mediaType) => ({ mediaType, conformsTo: [] }),
  );

  const groups = stringArray(document.format_group);
  if (groups.includes(FORMAT_GROUP_SPARQL)) {
    distributions.push({
      mediaType: null,
      conformsTo: [SPARQL_PROTOCOL_URI],
    });
  }
  if (
    groups.includes(FORMAT_GROUP_RDF) &&
    !distributions.some(
      (distribution) =>
        distribution.mediaType !== null &&
        (RDF_MEDIA_TYPES as readonly string[]).includes(distribution.mediaType),
    )
  ) {
    // Ensure an RDF media-type badge exists even if the granular `format` value
    // is absent, so the card’s RDF detection matches the grouped facet.
    distributions.push({ mediaType: RDF_MEDIA_TYPES[0], conformsTo: [] });
  }

  return distributions;
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  return typeof value === 'string' ? [value] : [];
}

/**
 * Run a dataset listing search against Typesense, mapping the hits to cards and
 * computing the facet sidebar. Returns empty results (and logs) when no search
 * backend is configured — the SPARQL listing fallback is intentionally gone.
 */
export async function fetchDatasets(
  searchFilters: SearchRequest,
  limit: number,
  offset = 0,
  orderBy: OrderBy = 'title',
): Promise<SearchResults> {
  const startTime = performance.now();
  const locale = getLocale() as SearchLocale;

  if (!isSearchConfigured()) {
    console.error(
      'Search backend not configured: set PUBLIC_TYPESENSE_HOST and ' +
        'PUBLIC_TYPESENSE_SEARCH_ONLY_API_KEY to enable the dataset listing.',
    );
    return {
      datasets: [],
      facets: await fetchFacets(searchFilters),
      total: 0,
      time: performance.now() - startTime,
    };
  }

  const [searchResponse, facets] = await Promise.all([
    searchDatasets(searchFilters, { limit, offset, orderBy, locale }),
    fetchFacets(searchFilters),
  ]);

  // Resolve the page’s publisher IRIs to labels once, for both locales (cheap:
  // the labels collection is cached in memory).
  const publisherIris = searchResponse.documents.flatMap((document) =>
    stringArray(document.publisher),
  );
  const resolver = labelResolver();
  const [publisherNl, publisherEn] = await Promise.all([
    resolver.resolve(publisherIris, 'nl'),
    resolver.resolve(publisherIris, 'en'),
  ]);

  const datasets = searchResponse.documents.map((document) =>
    cardFromDocument(document, locale, { nl: publisherNl, en: publisherEn }),
  );

  return {
    datasets,
    facets,
    total: searchResponse.total,
    time: performance.now() - startTime,
  };
}

// --- SPARQL query builders for the “Run SPARQL” button ----------------------
//
// The dataset listing now runs against Typesense, but the “Run SPARQL” button on
// /datasets still offers the user the equivalent query as SPARQL (so they can run
// it themselves against the public endpoint). These builders reproduce the
// listing’s filters as a SPARQL CONSTRUCT; they are the only SPARQL the listing
// page retains. Everything else (detail page, validation, RSS, sitemap, proxy)
// keeps its own SPARQL elsewhere.

export const prefixes = `
PREFIX dcat: <http://www.w3.org/ns/dcat#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX dqv: <http://www.w3.org/ns/dqv#>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX nde: <https://def.nde.nl/metric#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX schema: <https://schema.org/>
PREFIX void: <http://rdfs.org/ns/void#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
`;

const SPARQL_PROTOCOL_FILTER_URI = `<${SPARQL_PROTOCOL_URI}>`;

export const filterDatasets = (filters: SearchRequest, skipDefaults = false) =>
  `?dataset a dcat:Dataset ;
    schema:subjectOf ?registrationUrl .
  filter(isuri(?dataset))

  ${filterClauses(filters, skipDefaults)}
`;

/**
 * Build the SPARQL CONSTRUCT the “Run SPARQL” button hands to the user: a listing
 * query equivalent to the current filters, ordered by title, projecting the
 * fields a card shows. Mirrors the previous `datasetCardsQuery` for `orderBy:
 * 'title'`, the only mode the button uses.
 */
export function datasetListingQuery(
  filters: SearchRequest,
  limit: number,
  locale: string,
): string {
  return `
  ${prefixes}

  CONSTRUCT {
    ?dataset a dcat:Dataset ;
      dct:title ?title ;
      dct:description ?description ;
      dct:language ?language ;
      dct:publisher ?publisher ;
      dct:license ?license ;
      schema:status ?status .
    ?publisher a foaf:Agent ;
      foaf:name ?publisherName .
  }
  WHERE {
    {
      SELECT ?dataset (SAMPLE(?title_) AS ?titleForSort) WHERE {
        ${filterDatasets(filters)}

        OPTIONAL {
          ?registrationUrl schema:validUntil ?validUntil .
          BIND("archived" as ?status)
        }

        # Order by title to get a deterministic slice from the results.
        # Prefer title in user's locale.
        OPTIONAL {
          ?dataset dct:title ?titleInLocale .
          FILTER(LANG(?titleInLocale) = "${locale}")
        }

        # Fall back to any title.
        OPTIONAL { ?dataset dct:title ?titleAny }
        BIND(COALESCE(?titleInLocale, ?titleAny) AS ?title_)
      }
      GROUP BY ?dataset
      ORDER BY ?status ?titleForSort
      LIMIT ${limit}
    }

    ?dataset a dcat:Dataset ;
      schema:subjectOf ?registrationUrl .

    OPTIONAL {
      ?registrationUrl schema:validUntil ?validUntil .
      BIND("archived" as ?status)
    }

    # Inside the dataset named graph.
    GRAPH ?g {
      ?dataset dct:title ?title ;
        dct:publisher ?publisher .

      ?publisher foaf:name ?publisherName .

      OPTIONAL { ?dataset dct:description ?description }
      OPTIONAL { ?dataset dct:language ?language }
      OPTIONAL { ?dataset dct:license ?license }
    }
  }
  ORDER BY ?status ?titleForSort
`;
}

function filterClauses(searchFilters: SearchRequest, skipDefaults = false) {
  if (!searchFilters) {
    return '';
  }

  const filterClausesArray: string[] = [];

  const {
    query,
    publisher,
    keyword,
    format,
    class: classFilter,
    terminologySource,
    catalog,
    size,
    status,
  } = searchFilters;

  if (query !== undefined && query.length > 0) {
    filterClausesArray.push(
      `?dataset dct:title ?title .
      ?dataset dct:publisher/foaf:name ?publisher_name .
      OPTIONAL { ?dataset dct:creator/foaf:name ?creator_name }
      OPTIONAL { ?dataset dct:description ?description }

       FILTER(CONTAINS(LCASE(?title), LCASE("${query}"))
        || CONTAINS(LCASE(?description), LCASE("${query}"))
        || CONTAINS(LCASE(?publisher_name), LCASE("${query}"))
        || CONTAINS(LCASE(?creator_name), LCASE("${query}")))`,
    );
  }

  if (publisher.length > 0) {
    filterClausesArray.push(publisherFilterClause(publisher));
  }

  if (keyword.length > 0) {
    filterClausesArray.push(keywordFilterClause(keyword));
  }

  if (format.length > 0) {
    filterClausesArray.push(formatFilterClause(format));
  }

  if (classFilter.length > 0) {
    filterClausesArray.push(classFilterClause(classFilter));
  }

  if (terminologySource.length > 0) {
    filterClausesArray.push(terminologySourceFilterClause(terminologySource));
  }

  if (catalog.length > 0) {
    filterClausesArray.push(catalogFilterClause(catalog));
  }

  if (status.length > 0) {
    filterClausesArray.push(statusFilterClause(status));
  } else if (!skipDefaults) {
    filterClausesArray.push(
      `?registrationUrl schema:additionalType <${REGISTRATION_STATUS_BASE_URI}valid> .`,
    );
  }

  if (size.min !== undefined || size.max !== undefined) {
    const sizeFilters: string[] = [];

    filterClausesArray.push(`
      SERVICE <${PUBLIC_KNOWLEDGE_GRAPH_ENDPOINT}> {
        ?dataset a void:Dataset ;
          void:triples ?datasetSize .
      }
    `);

    if (size.min !== undefined) {
      sizeFilters.push(`?datasetSize >= ${size.min}`);
    }
    if (size.max !== undefined) {
      sizeFilters.push(`?datasetSize <= ${size.max}`);
    }

    if (sizeFilters.length > 0) {
      filterClausesArray.push(`FILTER(${sizeFilters.join(' && ')})`);
    }
  }

  return filterClausesArray.join('\n  ');
}

function publisherFilterClause(values: string[]): string {
  const organizationValues = values.map((value) => `<${value}>`).join(', ');
  return `{
      ?dataset dct:publisher ?organization .
      FILTER(?organization IN (${organizationValues}))
    } UNION {
      ?dataset dct:creator ?organization .
      FILTER(?organization IN (${organizationValues}))
    }`;
}

function keywordFilterClause(values: string[]): string {
  return `?dataset dcat:keyword ?keyword .
    FILTER(STR(?keyword) IN (${inLiterals(values)}))`;
}

function formatFilterClause(values: string[]): string {
  const selectedGroups = values.filter((value) => value.startsWith('group:'));
  const selectedMediaTypes = values.filter(
    (value) => !value.startsWith('group:'),
  );

  const selectClauses = ['?dataset dcat:distribution ?distribution'];
  const filterParts: string[] = [];

  if (selectedGroups.includes(FORMAT_GROUP_SPARQL)) {
    selectClauses.push('OPTIONAL { ?distribution dct:conformsTo ?conformsTo }');
    filterParts.push(`?conformsTo = ${SPARQL_PROTOCOL_FILTER_URI}`);
  }

  if (selectedGroups.includes(FORMAT_GROUP_RDF)) {
    selectedMediaTypes.push(...RDF_MEDIA_TYPES);
  }

  if (selectedMediaTypes.length > 0) {
    selectClauses.push(`?distribution dcat:mediaType ?rawMediaType .
      ${normalizeMediaType('?rawMediaType', '?mediaType')}`);
    const selectedMediaTypesQuoted = selectedMediaTypes
      .map((type) => `"${type}"`)
      .join(', ');
    filterParts.push(`?mediaType IN (${selectedMediaTypesQuoted})`);
  }

  return `${selectClauses.join('. ')}
    FILTER(${filterParts.join('||')})`;
}

function classFilterClause(values: string[]): string {
  const classValues = values
    .filter((value) => !value.startsWith('group:'))
    .map((value) => `<${value}>`);
  if (classValues.length === 0) {
    return '';
  }
  return `SERVICE <${PUBLIC_KNOWLEDGE_GRAPH_ENDPOINT}> {
      ?dataset void:classPartition ?partition .
      ?partition void:class ?class .
      FILTER(?class IN (${classValues.join(', ')}))
    }`;
}

function terminologySourceFilterClause(values: string[]): string {
  const sourceValues = values.map((value) => `<${value}>`).join(', ');
  return `SERVICE <${PUBLIC_KNOWLEDGE_GRAPH_ENDPOINT}> {
      [] a void:Linkset ;
        void:subjectsTarget ?dataset ;
        void:objectsTarget ?terminologySource .
      FILTER(?terminologySource IN (${sourceValues}))
    }`;
}

function catalogFilterClause(values: string[]): string {
  const catalogValues = values.map((value) => `<${value}>`).join(', ');
  return `?dataset dct:isPartOf ?catalog .
    FILTER(?catalog IN (${catalogValues}))`;
}

function statusFilterClause(values: string[]): string {
  const statusUris = values
    .map((value) => `<${REGISTRATION_STATUS_BASE_URI}${value}>`)
    .join(', ');
  return `?registrationUrl schema:additionalType ?statusType .
    FILTER(?statusType IN (${statusUris}))`;
}
