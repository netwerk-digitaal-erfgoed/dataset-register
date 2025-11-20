import { createLens, type SchemaInterface } from 'ldkit';
import { ldkit, rdf, rdfs, xsd } from 'ldkit/namespaces';
import { filterDatasets, prefixes, type SearchRequest } from './datasets.js';
import {
  PUBLIC_SPARQL_ENDPOINT,
  PUBLIC_KNOWLEDGE_GRAPH_ENDPOINT,
} from '$env/static/public';
import { RDF_MEDIA_TYPES } from '$lib/constants.js';
import { getLocalizedValue } from '$lib/utils/i18n';
import * as m from '$lib/paraglide/messages';
import { SparqlEndpointFetcher } from 'fetch-sparql-endpoint';
import { voidNs } from '../rdf.js';
import { inLiterals } from '$lib/utils/sparql';
import { getLocale } from '$lib/paraglide/runtime';

const fetcher = new SparqlEndpointFetcher();

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

/**
 * A facet value selected by the user.
 */
export interface SelectedFacetValue {
  value: string;
  label?: Record<string, string>;
}

export type FacetValueOptions = string[];

export type SelectedFacetValues = FacetValueOptions | FacetValueRange;

/**
 * A facet with counts for each value based on the current search query, returned by the server.
 */
export type CountedFacetValue = SchemaInterface<typeof FacetSchema>;

export interface Histogram {
  range: FacetValueRange;
  bins: HistogramBin[];
}

// Build regex pattern for RDF media types
const rdfMediaTypesPattern = RDF_MEDIA_TYPES.map((type) =>
  type.replace(/\//g, '\\\\/').replace(/\+/g, '\\\\+'),
).join('|');

const SPARQL_PROTOCOL_URI = '<https://www.w3.org/TR/sparql11-protocol/>';
const GROUP_RDF = 'group:rdf';
const GROUP_SPARQL = 'group:sparql';

// Class groups
const GROUP_PERSON = 'group:person';
const GROUP_ORGANIZATION = 'group:organization';
const GROUP_MEDIA = 'group:media';
const GROUP_CONCEPT = 'group:concept';
const GROUP_CREATIVE_WORK = 'group:creative-work';
const GROUP_PLACE = 'group:place';
const GROUP_DATE = 'group:date';
const GROUP_PROVENANCE = 'group:provenance';
const GROUP_EVENT = 'group:event';

// Mapping of class URIs to groups (supporting both http and https for schema.org)
const classGroups = {
  [GROUP_PERSON]: [
    'http://schema.org/Person',
    'https://schema.org/Person',
    'http://www.cidoc-crm.org/cidoc-crm/E21_Person',
    'http://www.cidoc-crm.org/cidoc-crm/E39_Actor',
  ],
  [GROUP_ORGANIZATION]: [
    'http://schema.org/Organization',
    'https://schema.org/Organization',
    'http://www.cidoc-crm.org/cidoc-crm/E39_Actor',
  ],
  [GROUP_MEDIA]: [
    'http://schema.org/MediaObject',
    'https://schema.org/MediaObject',
    'http://schema.org/AudioObject',
    'https://schema.org/AudioObject',
    'http://schema.org/ImageObject',
    'https://schema.org/ImageObject',
    'http://www.cidoc-crm.org/cidoc-crm/E36_Visual_Item',
  ],
  [GROUP_CONCEPT]: ['http://www.w3.org/2004/02/skos/core#Concept'],
  [GROUP_CREATIVE_WORK]: [
    'http://schema.org/CreativeWork',
    'https://schema.org/CreativeWork',
    'http://schema.org/Article',
    'https://schema.org/Article',
    'http://schema.org/Book',
    'https://schema.org/Book',
    'http://schema.org/MusicComposition',
    'https://schema.org/MusicComposition',
    'http://www.cidoc-crm.org/cidoc-crm/E65_Creation',
    'http://www.cidoc-crm.org/cidoc-crm/E22_Human-Made_Object',
    'http://www.cidoc-crm.org/cidoc-crm/E12_Production',
  ],
  [GROUP_PLACE]: [
    'http://schema.org/Place',
    'https://schema.org/Place',
    'http://schema.org/Country',
    'https://schema.org/Country',
    'http://schema.org/Periodical',
    'https://schema.org/Periodical',
    'http://schema.org/PostalAddress',
    'https://schema.org/PostalAddress',
    'http://www.cidoc-crm.org/cidoc-crm/E53_Place',
    'http://www.europeana.eu/schemas/edm/Place',
  ],
  [GROUP_DATE]: [
    'https://www.ica.org/standards/RiC/ontology#DateRange',
    'https://www.ica.org/standards/RiC/ontology#SingleDate',
    'http://www.cidoc-crm.org/cidoc-crm/E52_Time-Span',
    'http://www.europeana.eu/schemas/edm/TimeSpan',
  ],
  [GROUP_PROVENANCE]: [
    'http://www.w3.org/ns/prov#Activity',
    'http://www.w3.org/ns/prov#Agent',
    'http://www.w3.org/ns/prov#Entity',
  ],
  [GROUP_EVENT]: [
    'http://www.cidoc-crm.org/cidoc-crm/E65_Creation',
    'http://www.cidoc-crm.org/cidoc-crm/E8_Acquisition',
    'http://schema.org/Event',
    'https://schema.org/Event',
    'http://schema.org/PublicationEvent',
    'https://schema.org/PublicationEvent',
  ],
};

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
        ?distribution dcat:mediaType ?rdf .
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
        selectClauses.push(
          'OPTIONAL { ?distribution dct:conformsTo ?conformsTo }',
        );
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
  keyword: {
    where: `?dataset dcat:keyword ?value .
      FILTER(LANG(?value) = "" || LANG(?value) = "${getLocale()}")`,
    filterClause: (values) => {
      return `?dataset dcat:keyword ?keyword .
        FILTER(STR(?keyword) IN (${inLiterals(values)}))`;
    },
  },
  class: {
    where: `{
      SERVICE <${PUBLIC_KNOWLEDGE_GRAPH_ENDPOINT}> {
        {
          ?dataset void:classPartition ?partition .
          ?partition void:class ?value .
      }${Object.keys(classGroups)
        .map(
          (group) => ` UNION {
        ?dataset void:classPartition ?partition .
        ?partition void:class ?class .
        FILTER(?class IN (${classGroups[group as keyof typeof classGroups].map((c) => `<${c}>`).join(', ')}))
        BIND("${group}" AS ?value)
      }`,
        )
        .join('')}
    }
    }`,
    filterClause: (values) => {
      if (values.length === 0) {
        return '';
      }

      const selectedGroups = values.filter((v) => v.startsWith('group:'));
      const selectedClasses = values.filter((v) => !v.startsWith('group:'));

      // Expand groups to their member classes
      for (const group of selectedGroups) {
        const groupClasses = classGroups[group as keyof typeof classGroups];
        if (groupClasses) {
          selectedClasses.push(...groupClasses);
        }
      }

      if (selectedClasses.length === 0) {
        return '';
      }

      const classValues = selectedClasses.map((c) => `<${c}>`).join(', ');

      return `SERVICE <${PUBLIC_KNOWLEDGE_GRAPH_ENDPOINT}> {
        ?dataset void:classPartition ?partition .
        ?partition void:class ?class .
        FILTER(?class IN (${classValues}))
      }`;
    },
  },
  terminologySource: {
    where: `{
      SERVICE <${PUBLIC_KNOWLEDGE_GRAPH_ENDPOINT}> {
        [] a void:Linkset ;
          void:subjectsTarget ?dataset ;
          void:objectsTarget ?value .
        OPTIONAL { ?value dct:title ?label }
      }
    }`,
    filterClause: (values) => {
      if (values.length === 0) {
        return '';
      }

      const sourceValues = values.map((s) => `<${s}>`).join(', ');

      return `SERVICE <${PUBLIC_KNOWLEDGE_GRAPH_ENDPOINT}> {
        [] a void:Linkset ;
          void:subjectsTarget ?dataset ;
          void:objectsTarget ?terminologySource .
        FILTER(?terminologySource IN (${sourceValues}))
      }`;
    },
  },
};

export type FacetKey = keyof typeof facetConfigs | 'size';

export type Facets = {
  publisher: CountedFacetValue[];
  keyword: CountedFacetValue[];
  format: CountedFacetValue[];
  class: CountedFacetValue[];
  terminologySource: CountedFacetValue[];
  size: Histogram;
};

export const facetQuery = (facet: string, searchFiltersQuery: string) => `
  ${prefixes}
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
    BIND(IRI(CONCAT('urn:facet:', ENCODE_FOR_URI(STR(?value)))) AS ?valueUri)
  }
  ORDER BY DESC(?count) ?value
`;

export async function fetchFacets(
  searchFilters: SearchRequest,
): Promise<Facets> {
  const facetKeys = Object.keys(facetConfigs) as Array<FacetKey>;

  // Fetch all facets in parallel and build the result object in one pass
  const [facetEntries, sizeRange, sizeHistogram] = await Promise.all([
    Promise.all(
      facetKeys.map(
        async (key) =>
          [key, await fetchFacetValues(key, searchFilters)] as const,
      ),
    ),
    fetchSizeRange(),
    fetchSizeHistogram(searchFilters),
  ]);

  return {
    ...Object.fromEntries(facetEntries),
    size: {
      range: sizeRange,
      bins: sizeHistogram,
    },
  } as Facets;
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

export interface FacetValueRange {
  min: number;
  max: number;
}

export interface HistogramBin {
  bin: number;
  count: number;
}

/**
 * Query the Dataset Knowledge Graph for dataset size.
 *
 * We query globally (unfiltered) to get the absolute range for the slider.
 */
export async function fetchSizeRange(): Promise<FacetValueRange> {
  const query = `
    PREFIX void: <http://rdfs.org/ns/void#>

    SELECT (MIN(?size) as ?minSize) (MAX(?size) as ?maxSize)
    WHERE {
      ?dataset void:triples ?size .
      FILTER(?size > 0)
    }
  `;

  try {
    const bindings = await fetcher.fetchBindings(
      PUBLIC_KNOWLEDGE_GRAPH_ENDPOINT,
      query,
    );

    for await (const binding of bindings) {
      const typedBinding = binding as unknown as {
        minSize: { value: string };
        maxSize: { value: string };
      };
      return {
        min: parseInt(typedBinding.minSize.value),
        max: parseInt(typedBinding.maxSize.value),
      };
    }
  } catch (error) {
    console.warn(
      'Failed to fetch size range from Dataset Knowledge Graph:',
      error,
    );
  }

  // Fallback to reasonable defaults if query fails
  return {
    min: 1,
    max: 1000000000, // 1B triples as fallback
  };
}

/**
 * Fetches histogram data showing the distribution of dataset sizes across logarithmic bins.
 * Applies current search filters (publisher, format, search query) but excludes size filters
 * to show the full distribution of matching datasets.
 */
export async function fetchSizeHistogram(
  searchFilters: SearchRequest,
): Promise<HistogramBin[]> {
  // Remove size filters for histogram - we want to show full distribution
  const filtersWithoutSize = {
    ...searchFilters,
    size: { min: undefined, max: undefined },
  };

  const query = `
    ${prefixes}

    SELECT ?bin (COUNT(DISTINCT ?dataset) as ?count) WHERE {
      ${filterDatasets(filtersWithoutSize)}

      SERVICE <${PUBLIC_KNOWLEDGE_GRAPH_ENDPOINT}> {
        ?dataset void:triples ?size .
      }

      # Bin sizes into logarithmic buckets using nested IF conditions
      BIND(
        IF(?size < 10, 0,
        IF(?size < 100, 1,
        IF(?size < 1000, 2,
        IF(?size < 10000, 3,
        IF(?size < 100000, 4,
        IF(?size < 1000000, 5,
        IF(?size < 10000000, 6,
        IF(?size < 100000000, 7,
        IF(?size < 1000000000, 8, 9)))))))))
      as ?bin)
    }
    GROUP BY ?bin
    ORDER BY ?bin
  `;

  const bindings = await fetcher.fetchBindings(PUBLIC_SPARQL_ENDPOINT, query);

  const histogram: HistogramBin[] = [];
  for await (const binding of bindings) {
    const typedBinding = binding as unknown as {
      bin: { value: string };
      count: { value: string };
    };
    histogram.push({
      bin: parseInt(typedBinding.bin.value),
      count: parseInt(typedBinding.count.value),
    });
  }

  return histogram;
}

const groupMessages = {
  [GROUP_RDF]: m['group:rdf'],
  [GROUP_SPARQL]: m['group:sparql'],
  [GROUP_PERSON]: m['group:person'],
  [GROUP_ORGANIZATION]: m['group:organization'],
  [GROUP_MEDIA]: m['group:media'],
  [GROUP_CONCEPT]: m['group:concept'],
  [GROUP_CREATIVE_WORK]: m['group:creative-work'],
  [GROUP_PLACE]: m['group:place'],
  [GROUP_DATE]: m['group:date'],
  [GROUP_PROVENANCE]: m['group:provenance'],
  [GROUP_EVENT]: m['group:event'],
};

export function facetDisplayValue(facetValue: SelectedFacetValue) {
  return (
    groupMessages[facetValue.value as keyof typeof groupMessages]?.() ??
    getLocalizedValue(facetValue.label) ??
    facetValue.value
  );
}

export function formatNumber(num: number, locale = 'en'): string {
  const formatter = new Intl.NumberFormat(locale, {
    notation: 'compact',
    compactDisplay: 'short',
  });
  return formatter.format(num);
}
