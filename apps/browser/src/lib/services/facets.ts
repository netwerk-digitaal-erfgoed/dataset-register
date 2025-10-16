import { createLens, createNamespace, type SchemaInterface } from 'ldkit';
import { ldkit, rdf, rdfs, xsd } from 'ldkit/namespaces';
import {
  type Facets,
  filterDatasets,
  prefixes,
  type SearchRequest,
} from './datasets.js';
import { PUBLIC_SPARQL_ENDPOINT } from '$env/static/public';

export const voidNs = createNamespace({
  iri: 'http://rdfs.org/ns/void#',
  prefix: 'void:',
  terms: ['Dataset', 'distinctSubjects'],
} as const);

const FacetSchema = {
  '@type': voidNs.Dataset,
  value: rdf.value,
  label: {
    '@id': rdfs.label,
    '@multilang': true,
    '@optional': true,
  },
  count: {
    '@id': voidNs.distinctSubjects,
    '@type': xsd.integer,
  },
} as const;

const facets = createLens(FacetSchema, {
  sources: [PUBLIC_SPARQL_ENDPOINT],
  // logQuery: (query: string) => console.log(query),
});

export type FacetValue = SchemaInterface<typeof FacetSchema>;

export interface SelectedFacetValue {
  value: FacetValue['value'];
  label: FacetValue['label'];
}

const facetConfigs = {
  publisher: {
    where: `?dataset dct:publisher ?value .
      ?value foaf:name ?label`,
  },
  // Why does QLever need the repeated { ?dataset dcat:distribution ?distribution } inside the UNION?
  format: {
    where: `{
      ?dataset dcat:distribution ?distribution .
       {
          ?dataset dcat:distribution ?distribution .
          ?distribution dcat:mediaType ?value .
       } UNION {
          ?distribution dcat:mediaType ?sparql
          FILTER(CONTAINS(?sparql, "sparql"))
          BIND("group:SPARQL" AS ?value)
       } UNION {
          ?distribution dcat:mediaType ?rdf
          FILTER(REGEX(?rdf, "^text/turtle|application/rdf\\\\+xml|application/n-triples"))
          BIND("group:RDF" AS ?value)
       }
    }`,
  },
};

export type FacetKey = keyof typeof facetConfigs;

export const facetQuery = (facet: string, searchFiltersQuery: string) => `
  ${prefixes}
  PREFIX void: <${voidNs.$iri}>
  PREFIX rdf: <${rdf.$iri}>

  CONSTRUCT {
    ?valueUri a <${voidNs.Dataset}>, <${ldkit.Resource}> ;
      rdf:value ?value ;
      rdfs:label ?label ;
      void:distinctSubjects ?count .
  }
  WHERE {
    {
      SELECT ?value ?label (COUNT(DISTINCT ?dataset) AS ?count) WHERE {
        ${searchFiltersQuery}
        ${facetConfigs[facet as FacetKey].where}
      }
      GROUP BY ?value ?label     
    }
    BIND(IRI(CONCAT('urn:facet:', STR(?value))) AS ?valueUri)
  }
  ORDER BY DESC(?count)
`;

export async function fetchFacets(
  searchFilters: SearchRequest,
): Promise<Facets> {
  const facetKeys = Object.keys(facetConfigs) as Array<FacetKey>;

  // Fetch all facets in parallel and build the result object in one pass
  const facetEntries = await Promise.all(
    facetKeys.map(
      async (key) => [key, await fetchFacetValues(key, searchFilters)] as const,
    ),
  );

  return Object.fromEntries(facetEntries) as Facets;
}

export async function fetchFacetValues(
  facet: FacetKey,
  searchFilters: SearchRequest,
): Promise<FacetValue[]> {
  const searchFiltersExcludingFacet = { ...searchFilters, [facet]: [] };
  const searchFiltersQuery = filterDatasets(searchFiltersExcludingFacet);
  const query = facetQuery(facet, searchFiltersQuery);

  return await facets.query(query);
}
