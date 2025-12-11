import { dcat } from '@lde/dataset-registry-client';
import { dcterms, foaf, ldkit, schema, xsd } from 'ldkit/namespaces';
import { createLens, type SchemaInterface } from 'ldkit';
import { SparqlEndpointFetcher } from 'fetch-sparql-endpoint';
import { facetConfigs, type Facets, fetchFacets } from '$lib/services/facets';
import { PUBLIC_SPARQL_ENDPOINT } from '$env/static/public';
import { voidNs } from '../rdf.js';
import { getLocale } from '$lib/paraglide/runtime';
import { normalizeMediaType } from '$lib/utils/sparql';

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
  datePosted: {
    '@id': schema.datePosted,
    '@type': xsd.dateTime,
    '@optional': true,
  },
} as const;

export type DatasetCard = SchemaInterface<typeof DatasetCardSchema>;

const datasetCards = createLens(DatasetCardSchema, {
  sources: [SPARQL_ENDPOINT],
});

export const prefixes = `
PREFIX dcat: <http://www.w3.org/ns/dcat#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>			
PREFIX schema: <http://schema.org/>
PREFIX void: <http://rdfs.org/ns/void#>
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
}

async function countDatasets(filters: SearchRequest) {
  const query = `
  ${prefixes}

  SELECT (COUNT(DISTINCT ?dataset) as ?count) WHERE {
    ${filterDatasets(filters)}
  }`;
  const bindings = await fetcher.fetchBindings(SPARQL_ENDPOINT, query);

  // COUNT query returns exactly one binding
  for await (const binding of bindings) {
    const typedBinding = binding as unknown as {
      count: { value: string };
    };
    return parseInt(typedBinding.count.value);
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
      schema:status ?status ;
      schema:datePosted ?datePosted .
    ?publisher a foaf:Agent ;
      foaf:name ?publisherName .
    ?distribution a dcat:Distribution ;
      dcat:mediaType ?mediaType ;
      dct:conformsTo ?conformsTo .
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

    # Fetch dataset size from Dataset Knowledge Graph via SPARQL Federation
    OPTIONAL {
      SERVICE <https://triplestore.netwerkdigitaalerfgoed.nl/repositories/dataset-knowledge-graph> {
        ?dataset void:triples ?size .
      }
    }
  }
  ORDER BY ${orderByClause}
`;
}

export const filterDatasets = (filters: SearchRequest) =>
  `?dataset a dcat:Dataset ;
    schema:subjectOf ?registrationUrl .
    
  ${filterClauses(filters)}
`;

export interface SearchResults {
  datasets: DatasetCard[];
  facets: Facets;
  total: number;
  time: number;
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
    datasetCards.query(
      datasetCardsQuery(searchFilters, limit, offset, orderBy, locale),
    ),
    fetchFacets(searchFilters),
  ]);

  return {
    datasets,
    facets,
    total,
    time: performance.now() - startTime,
  };
}

function filterClauses(searchFilters: SearchRequest) {
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
  } = searchFilters;

  if (query !== undefined && query.length > 0) {
    filterClausesArray.push(
      `?dataset dct:title ?title .
      ?dataset dct:publisher/foaf:name ?publisher_name .
      OPTIONAL { ?dataset dct:description ?description }

       FILTER(CONTAINS(LCASE(?title), LCASE("${query}"))
        || CONTAINS(LCASE(?description), LCASE("${query}"))
        || CONTAINS(LCASE(?publisher_name), LCASE("${query}")))`,
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

  if (size.min !== undefined || size.max !== undefined) {
    const sizeFilters: string[] = [];

    // When filtering by size, require datasets to have size data (not OPTIONAL).
    // This ensures only datasets with known sizes are returned in filtered results.
    filterClausesArray.push(`
      SERVICE <https://triplestore.netwerkdigitaalerfgoed.nl/repositories/dataset-knowledge-graph> {
        ?dataset void:triples ?datasetSize .
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
