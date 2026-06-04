import { dcat } from '@lde/dataset-registry-client';
import { dcterms, foaf, ldkit, xsd } from 'ldkit/namespaces';
import { createLens, type SchemaInterface } from 'ldkit';
import { SparqlEndpointFetcher } from 'fetch-sparql-endpoint';
import { facetConfigs, type Facets, fetchFacets } from '$lib/services/facets';
import { PUBLIC_SPARQL_ENDPOINT } from '$env/static/public';
import { schemaNs as schema, voidNs } from '../rdf.js';
import { getLocale } from '$lib/paraglide/runtime';
import { normalizeMediaType } from '$lib/utils/sparql';
import {
  IIIF_PRESENTATION_API,
  MANIFESTS_SAMPLED_METRIC,
  MANIFESTS_VALIDATED_METRIC,
  QUADS_VALIDATED_METRIC,
  SCHEMA_AP_NDE_CONFORMANCE_METRIC,
  iiifState,
  schemaApNdeState,
  type IiifManifests,
  type SchemaApNdeConformance,
} from '$lib/services/nde-compatibility';

export const SPARQL_ENDPOINT = PUBLIC_SPARQL_ENDPOINT;
const fetcher = new SparqlEndpointFetcher();

// Base distribution schema with common fields
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

// Base dataset schema with fields shared between card and detail views
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

export const DatasetCardSchema = {
  ...BaseDatasetSchema,
  distribution: {
    '@id': dcat.distribution,
    '@optional': true,
    '@array': true,
    '@schema': BaseDistributionSchema,
  },
  size: {
    '@id': voidNs.triples,
    '@type': xsd.integer,
    '@optional': true,
  },
  // The number of IIIF Presentation manifests detected in the dataset, recorded
  // in the Knowledge Graph as a void:subset keyed on dcterms:conformsTo. The
  // card query only ever projects the IIIF subset (see datasetCardsQuery), so a
  // single optional value suffices.
  iiifSubset: {
    '@id': voidNs.subset,
    '@optional': true,
    '@schema': {
      conformsTo: {
        '@id': dcterms.conformsTo,
      },
      entities: {
        '@id': voidNs.entities,
        '@type': xsd.integer,
      },
    },
  },
  // IIIF manifest validation measurements, projected onto the dataset by the
  // card query so the icon can be limited to datasets with working IIIF.
  iiifManifestsSampled: {
    '@id': MANIFESTS_SAMPLED_METRIC,
    '@type': xsd.integer,
    '@optional': true,
  },
  iiifManifestsValidated: {
    '@id': MANIFESTS_VALIDATED_METRIC,
    '@type': xsd.integer,
    '@optional': true,
  },
  // SCHEMA-AP-NDE sample-conformance measurements, projected onto the dataset by
  // the card query so the badge can be limited to conforming datasets.
  schemaApNdeQuadsValidated: {
    '@id': QUADS_VALIDATED_METRIC,
    '@type': xsd.integer,
    '@optional': true,
  },
  schemaApNdeConformant: {
    '@id': SCHEMA_AP_NDE_CONFORMANCE_METRIC,
    '@type': xsd.boolean,
    '@optional': true,
  },
  datePosted: {
    '@id': schema.datePosted,
    '@type': xsd.dateTime,
    '@optional': true,
  },
} as const;

export type DatasetCard = SchemaInterface<typeof DatasetCardSchema>;

// The IIIF manifest figures for a card: declared count plus the validation
// measurements (null when the dataset declares no IIIF or has no measurement).
function cardIiifManifests(dataset: DatasetCard): IiifManifests {
  const subset = dataset.iiifSubset;
  const declared =
    subset && subset.conformsTo === IIIF_PRESENTATION_API
      ? (subset.entities ?? 0)
      : 0;
  return {
    declared,
    sampled: dataset.iiifManifestsSampled ?? null,
    validated: dataset.iiifManifestsValidated ?? null,
  };
}

// The number of IIIF Presentation manifests the dataset declares, for the card
// tooltip.
export function iiifManifestCount(dataset: DatasetCard): number {
  return cardIiifManifests(dataset).declared;
}

// Whether the dataset provides working IIIF media. The card icon is shown only
// in this case — not when manifests are declared but failed validation, and not
// when none are declared.
export function providesWorkingIiif(dataset: DatasetCard): boolean {
  return iiifState(cardIiifManifests(dataset)) === 'met';
}

// The SCHEMA-AP-NDE conformance figures for a card. The card only ever shows the
// badge in the `met` state, which never depends on the `dct:conformsTo` claim
// (that claim only splits the `failed`/`unmet` branch), so the card leaves it
// false rather than fetching it.
function cardSchemaApNde(dataset: DatasetCard): SchemaApNdeConformance {
  return {
    quadsValidated: dataset.schemaApNdeQuadsValidated ?? null,
    conformant: dataset.schemaApNdeConformant ?? null,
    declaresProfile: false,
  };
}

// Whether the dataset conforms to the NDE Schema.org Application Profile in the
// sampled resources. The card badge is shown only in this case.
export function conformsToSchemaApNde(dataset: DatasetCard): boolean {
  return schemaApNdeState(cardSchemaApNde(dataset)).state === 'met';
}

const datasetCards = createLens(DatasetCardSchema, {
  sources: [SPARQL_ENDPOINT],
});

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

export interface SearchRequest {
  query?: string;
  publisher: string[];
  keyword: string[];
  format: string[];
  class: string[];
  terminologySource: string[];
  size: {
    min?: number;
    max?: number;
  };
  status: string[];
}

async function countDatasets(filters: SearchRequest) {
  const query = `
  ${prefixes}

  SELECT (COUNT(DISTINCT ?dataset) as ?count) WHERE {
    ${filterDatasets(filters)}
  }`;

  try {
    const bindings = await fetcher.fetchBindings(SPARQL_ENDPOINT, query);

    // COUNT query returns exactly one binding
    for await (const binding of bindings) {
      const typedBinding = binding as unknown as {
        count: { value: string };
      };
      return parseInt(typedBinding.count.value);
    }
  } catch (error) {
    console.error('Count datasets query failed:', error, '\nQuery:', query);
  }
  return 0;
}

export type OrderBy = 'title' | 'datePosted';

export function datasetCardsQuery(
  filters: SearchRequest,
  limit: number,
  offset = 0,
  orderBy: OrderBy = 'title',
  locale: string,
) {
  const orderByClause =
    orderBy === 'datePosted' ? 'DESC(?datePosted)' : `?status ?titleForSort`;

  return `
  ${prefixes}

  CONSTRUCT {
    ?dataset a dcat:Dataset, <${ldkit.Resource}> ;
      dct:title ?title ;
      dct:description ?description ;
      dct:language ?language ;
      dct:publisher ?publisher ;
      dct:license ?license ;
      dcat:distribution ?distribution ;
      void:triples ?size ;
      void:subset ?iiifSubset ;
      nde:manifests-sampled ?iiifSampled ;
      nde:manifests-validated ?iiifValidated ;
      nde:quads-validated ?schemaApNdeQuadsValidated ;
      nde:schema-ap-nde-sample-conformance ?schemaApNdeConformant ;
      schema:status ?status ;
      schema:datePosted ?datePosted .
    ?publisher a foaf:Agent ;
      foaf:name ?publisherName .
    ?distribution a dcat:Distribution ;
      dcat:mediaType ?mediaType ;
      dct:conformsTo ?conformsTo .
    ?iiifSubset dct:conformsTo <${IIIF_PRESENTATION_API}> ;
      void:entities ?iiifManifests .
  }
  WHERE {
    # Inside the default graph, which contains the registry's metadata.
    {
      SELECT ?dataset ${orderBy === 'title' ? '(SAMPLE(?title_) AS ?titleForSort)' : '(SAMPLE(?datePosted_) AS ?datePosted)'} WHERE {
        ${filterDatasets(filters)}

        OPTIONAL {
          ?registrationUrl schema:validUntil ?validUntil .
          BIND("archived" as ?status)
        }

        ${
          orderBy === 'title'
            ? `
        # Order by title to get a deterministic slice from the results.
        # Prefer title in user's locale.
        OPTIONAL {
          ?dataset dct:title ?titleInLocale .
          FILTER(LANG(?titleInLocale) = "${locale}")
        }

        # Fall back to any title.
        OPTIONAL { ?dataset dct:title ?titleAny }
        BIND(COALESCE(?titleInLocale, ?titleAny) AS ?title_)
        `
            : `
        OPTIONAL { ?registrationUrl schema:datePosted ?datePosted_ }
        `
        }
      }
      GROUP BY ?dataset
      ORDER BY ${orderByClause}
      LIMIT ${limit}
      OFFSET ${offset}
    }

    ?dataset a dcat:Dataset ;
      schema:subjectOf ?registrationUrl .

    ${orderBy === 'datePosted' ? 'OPTIONAL { ?registrationUrl schema:datePosted ?datePosted }' : ''}

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
                 
      OPTIONAL {
        ?dataset dcat:distribution ?distribution .
        ?distribution dcat:mediaType ?rawMediaType .
        ${normalizeMediaType('?rawMediaType', '?mediaType')}
        OPTIONAL { ?distribution dct:conformsTo ?conformsTo }
      }
    }

    # Fetch dataset size and IIIF manifest count from the Dataset Knowledge Graph
    # via SPARQL Federation. The IIIF subset is itself optional: not every
    # dataset exposes IIIF Presentation manifests.
    OPTIONAL {
      SERVICE <https://triplestore.netwerkdigitaalerfgoed.nl/repositories/dataset-knowledge-graph> {
        ?dataset a void:Dataset ;
          void:triples ?size .
        OPTIONAL {
          ?dataset void:subset ?iiifSubset .
          ?iiifSubset dct:conformsTo <${IIIF_PRESENTATION_API}> ;
            void:entities ?iiifManifests .
          OPTIONAL {
            ?dataset dqv:hasQualityMeasurement [
              dqv:isMeasurementOf nde:manifests-sampled ;
              dqv:value ?iiifSampled
            ] .
          }
          OPTIONAL {
            ?dataset dqv:hasQualityMeasurement [
              dqv:isMeasurementOf nde:manifests-validated ;
              dqv:value ?iiifValidated
            ] .
          }
        }
        # SCHEMA-AP-NDE sample conformance. Anchored on quads-validated with the
        # conformance boolean co-required in the same OPTIONAL: the two are
        # co-emitted, so this single left-join boundary keeps one row per dataset
        # (no UNION, no nested OPTIONAL) and does not multiply the multi-valued
        # patterns outside the SERVICE block.
        OPTIONAL {
          ?dataset dqv:hasQualityMeasurement [
            dqv:isMeasurementOf nde:quads-validated ;
            dqv:value ?schemaApNdeQuadsValidated
          ] , [
            dqv:isMeasurementOf nde:schema-ap-nde-sample-conformance ;
            dqv:value ?schemaApNdeConformant
          ] .
        }
      }
    }
  }
  ORDER BY ${orderByClause}
`;
}

export const filterDatasets = (filters: SearchRequest, skipDefaults = false) =>
  `?dataset a dcat:Dataset ;
    schema:subjectOf ?registrationUrl .
  filter(isuri(?dataset))

  ${filterClauses(filters, skipDefaults)}
`;

export interface SearchResults {
  datasets: DatasetCard[];
  facets: Facets;
  total: number;
  time: number;
}

async function fetchDatasetCards(
  searchFilters: SearchRequest,
  limit: number,
  offset: number,
  orderBy: OrderBy,
  locale: string,
): Promise<DatasetCard[]> {
  const query = datasetCardsQuery(
    searchFilters,
    limit,
    offset,
    orderBy,
    locale,
  );
  try {
    return await datasetCards.query(query);
  } catch (error) {
    console.error('Dataset cards query failed:', error, '\nQuery:', query);
    return [];
  }
}

export async function fetchDatasets(
  searchFilters: SearchRequest,
  limit: number,
  offset = 0,
  orderBy: OrderBy = 'title',
): Promise<SearchResults> {
  const startTime = performance.now();
  const locale = getLocale();

  // Start all queries in parallel using Promise.all
  const [total, datasets, facets] = await Promise.all([
    countDatasets(searchFilters),
    fetchDatasetCards(searchFilters, limit, offset, orderBy, locale),
    fetchFacets(searchFilters),
  ]);

  return {
    datasets,
    facets,
    total,
    time: performance.now() - startTime,
  };
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
    filterClausesArray.push(facetConfigs.publisher.filterClause(publisher));
  }

  if (keyword.length > 0) {
    filterClausesArray.push(facetConfigs.keyword.filterClause(keyword));
  }

  if (format.length > 0) {
    filterClausesArray.push(facetConfigs.format.filterClause(format));
  }

  if (classFilter.length > 0) {
    filterClausesArray.push(facetConfigs.class.filterClause(classFilter));
  }

  if (terminologySource.length > 0) {
    filterClausesArray.push(
      facetConfigs.terminologySource.filterClause(terminologySource),
    );
  }

  // Handle status filter with defaultClause support
  if (status.length > 0) {
    filterClausesArray.push(facetConfigs.status.filterClause(status));
  } else if (!skipDefaults && facetConfigs.status.defaultClause) {
    filterClausesArray.push(facetConfigs.status.defaultClause);
  }

  if (size.min !== undefined || size.max !== undefined) {
    const sizeFilters: string[] = [];

    // When filtering by size, require datasets to have size data (not OPTIONAL).
    // This ensures only datasets with known sizes are returned in filtered results.
    filterClausesArray.push(`
      SERVICE <https://triplestore.netwerkdigitaalerfgoed.nl/repositories/dataset-knowledge-graph> {
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
