import { dcat } from '@lde/dataset-registry-client';
import { dcterms, foaf, ldkit } from 'ldkit/namespaces';
import { createLens, type SchemaInterface } from 'ldkit';
import { SparqlEndpointFetcher } from 'fetch-sparql-endpoint';

const SPARQL_ENDPOINT =
  'https://datasetregister.netwerkdigitaalerfgoed.nl/sparql';
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
} as const;

export type DatasetCard = SchemaInterface<typeof DatasetCardSchema>;

const datasetCards = createLens(DatasetCardSchema, {
  sources: [SPARQL_ENDPOINT],
});

const prefixes = `
PREFIX dcat: <http://www.w3.org/ns/dcat#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>			
PREFIX schema: <http://schema.org/>
`;

interface SearchFilters {
  query?: string;
}

async function countDatasets(filters: SearchFilters) {
  const query = `
  ${prefixes}

  SELECT (COUNT(DISTINCT ?dataset) as ?count) WHERE {
    ${filterDatasets(filters)}
  }`;
  const bindings = await fetcher.fetchBindings(SPARQL_ENDPOINT, query);

  // COUNT query returns exactly one binding
  for await (const binding of bindings) {
    return parseInt(binding.count.value);
  }
  return 0;
}

const datasetCardsQuery = (
  filters: SearchFilters,
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

const filterDatasets = (filters: SearchFilters) =>
  `?dataset a dcat:Dataset ;
    schema:subjectOf ?registrationUrl .
    
  OPTIONAL { ?registrationUrl schema:validUntil ?validUntil }  
        
  ${filterClauses(filters)}
`;

export async function fetchDatasets(
  limit: number,
  search?: string,
  offset = 0,
) {
  const searchFilters = {
    query: search,
  };
  const startTime = performance.now();
  const total = await countDatasets(searchFilters);
  const query = datasetCardsQuery(searchFilters, limit, offset);
  const results = await datasetCards.query(query);

  return {
    total,
    results,
    time: performance.now() - startTime,
  };
}

function filterClauses(searchFilters: SearchFilters) {
  const filterClausesArray: string[] = [];

  const { query } = searchFilters;

  if (query !== undefined) {
    filterClausesArray.push(
      `?dataset dct:title ?title ;
        dct:description ?description .
      ?dataset dct:publisher/foaf:name ?publisher_name .
       
       FILTER(CONTAINS(LCASE(?title), LCASE("${query}")) 
        || CONTAINS(LCASE(?description), LCASE("${query}"))
        || CONTAINS(LCASE(?publisher_name), LCASE("${query}")))`,
    );
  }

  return filterClausesArray;
}
