import { createLens, createNamespace, type SchemaInterface } from 'ldkit';
import { ldkit, rdf, rdfs, xsd } from 'ldkit/namespaces';
import {
  type Facets,
  filterDatasets,
  prefixes,
  type SearchRequest,
} from './datasets.js';
import { PUBLIC_SPARQL_ENDPOINT } from '$env/static/public';
import { RDF_MEDIA_TYPES } from '$lib/constants.js';
import { getLocalizedValue } from '$lib/utils/i18n';
import * as m from '$lib/paraglide/messages';

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

export type CountedFacetValue = SchemaInterface<typeof FacetSchema>;

export interface FacetValue {
  value: string;
  label?: Record<string, string>;
}

// Build regex pattern for RDF media types
const rdfMediaTypesPattern = RDF_MEDIA_TYPES.map((type) =>
  type.replace(/\//g, '\\\\/').replace(/\+/g, '\\\\+'),
).join('|');

const SPARQL_PROTOCOL_URI = '<https://www.w3.org/TR/sparql11-protocol/>';
const GROUP_RDF = 'group:rdf';
const GROUP_SPARQL = 'group:sparql';

interface FacetConfig {
  /**
   * SPARQL WHERE clause that reads values.
   */
  where: string;

  /**
   * Function that takes selected values and returns a SPARQL FILTER clause.
   */
  filterClause: (values: string[]) => string;
}

export const facetConfigs: Record<string, FacetConfig> = {
  publisher: {
    where: `?dataset dct:publisher ?value .
      ?value foaf:name ?label`,
    filterClause: (values) => {
      const publisherValues = values.map((p) => `<${p}>`).join(', ');

      return `?dataset dct:publisher ?publisher .
        FILTER(?publisher IN (${publisherValues}))`;
    },
  },
  // Why does QLever need the repeated { ?dataset dcat:distribution ?distribution } inside the UNION?
  format: {
    where: `{
      ?dataset dcat:distribution ?distribution .
      {
        ?dataset dcat:distribution ?distribution .
        ?distribution dcat:mediaType ?value .
      } UNION {
        ?dataset dcat:distribution ?distribution .
        ?distribution dct:conformsTo ?conformsTo .
        FILTER(?conformsTo = ${SPARQL_PROTOCOL_URI})
        BIND("${GROUP_SPARQL}" AS ?value)
       } UNION {
        ?dataset dcat:distribution ?distribution .
        ?distribution dcat:mediaType ?rdf
        FILTER(REGEX(?rdf, "^(${rdfMediaTypesPattern})$"))
        BIND("${GROUP_RDF}" AS ?value)
       }
    }`,
    filterClause: (values) => {
      if (values.length === 0) {
        return '';
      }

      const selectedGroups = values.filter((f) => f.startsWith('group:'));
      const selectedMediaTypes = values.filter((f) => !f.startsWith('group:'));

      const selectClauses = ['?dataset dcat:distribution ?distribution'];
      const filterClauses = [];

      if (selectedGroups.includes(GROUP_SPARQL)) {
        selectClauses.push('?distribution dct:conformsTo ?conformsTo');
        filterClauses.push(`?conformsTo = ${SPARQL_PROTOCOL_URI}`);
      }

      if (selectedGroups.includes(GROUP_RDF)) {
        selectedMediaTypes.push(...RDF_MEDIA_TYPES);
      }

      if (selectedMediaTypes.length > 0) {
        selectClauses.push('?distribution dcat:mediaType ?mediaType');

        const selectedMediaTypesQuoted = selectedMediaTypes
          .map((type) => `"${type}"`)
          .join(', ');
        filterClauses.push(`?mediaType IN (${selectedMediaTypesQuoted})`);
      }

      return `${selectClauses.join('. ')}
        FILTER(${filterClauses.join('||')})`;
    },
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
): Promise<CountedFacetValue[]> {
  const searchFiltersExcludingFacet = { ...searchFilters, [facet]: [] };
  const searchFiltersQuery = filterDatasets(searchFiltersExcludingFacet);
  const query = facetQuery(facet, searchFiltersQuery);

  return await facets.query(query);
}

const groupMessages = {
  [GROUP_RDF]: m['group:rdf'],
  [GROUP_SPARQL]: m['group:sparql'],
};

export function facetDisplayValue(facetValue: FacetValue) {
  return (
    groupMessages[facetValue.value as keyof typeof groupMessages]?.() ??
    getLocalizedValue(facetValue.label) ??
    facetValue.value
  );
}
