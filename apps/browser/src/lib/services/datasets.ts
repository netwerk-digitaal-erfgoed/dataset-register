import { dcat } from '@lde/dataset-registry-client';
import { dcterms, foaf, ldkit, schema } from 'ldkit/namespaces';
import { createLens, type SchemaInterface } from 'ldkit';
import { SparqlEndpointFetcher } from 'fetch-sparql-endpoint';
import {
  type CountedFacetValue,
  facetConfigs,
  type FacetKey,
  fetchFacets,
} from '$lib/services/facets';
import { PUBLIC_SPARQL_ENDPOINT } from '$env/static/public';

export const SPARQL_ENDPOINT = PUBLIC_SPARQL_ENDPOINT;
const fetcher = new SparqlEndpointFetcher();

export const DatasetCardSchema = {
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
  distribution: {
    '@id': dcat.distribution,
    '@optional': true,
    '@array': true,
    '@schema': {
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
    },
  },
  registrationUrl: {
    '@id': schema.subjectOf,
    validUntil: {
      '@id': schema.validUntil,
      '@optional': true,
    },
    datePosted: {
      '@id': schema.datePosted,
      // TODO: optional?
    },
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
`;

export interface SearchRequest {
  query?: string;
  publisher: string[];
  format: string[];
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

export const datasetCardsQuery = (
  filters: SearchRequest,
  limit: number,
  offset = 0,
) => `
  ${prefixes}

  CONSTRUCT {
    ?dataset a dcat:Dataset, <${ldkit.Resource}> ;
      dct:title ?title ;
      dct:description ?description ;
      dct:language ?language ;
      dct:publisher ?publisher ;
      dct:license ?license ;
      dcat:distribution ?distribution .
    ?publisher a foaf:Agent ;
      foaf:name ?publisherName .
    ?distribution a dcat:Distribution ;
      dcat:mediaType ?mediaType ;
      dct:conformsTo ?conformsTo .    
  }
  WHERE {		
    # Inside the default graph, which contains the registry’s metadata.
    {
      SELECT DISTINCT ?dataset WHERE {
        ${filterDatasets(filters)}
      }
      LIMIT ${limit}
      OFFSET ${offset}
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
        OPTIONAL { ?distribution dcat:mediaType ?mediaType }
        OPTIONAL { ?distribution dct:conformsTo ?conformsTo }
      }
    }		
  }
  ORDER BY ?title  
`;

export const filterDatasets = (filters: SearchRequest) =>
  `?dataset a dcat:Dataset ;
    schema:subjectOf ?registrationUrl .
    
  OPTIONAL { ?registrationUrl schema:validUntil ?validUntil }  
        
  ${filterClauses(filters)}
`;

export type Facets = Record<FacetKey, CountedFacetValue[]>;

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
): Promise<SearchResults> {
  const startTime = performance.now();

  // Start all queries in parallel using Promise.all
  const [total, datasets, facets] = await Promise.all([
    countDatasets(searchFilters),
    datasetCards.query(datasetCardsQuery(searchFilters, limit, offset)),
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

  const { query, publisher, format } = searchFilters;

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

  if (format.length > 0) {
    filterClausesArray.push(facetConfigs.format.filterClause(format));
  }

  return filterClausesArray.join('\n  ');
}
