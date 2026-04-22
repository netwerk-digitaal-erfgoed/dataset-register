import { dcat } from '@lde/dataset-registry-client';
import { dcterms, foaf, ldkit, xsd } from 'ldkit/namespaces';
import { createLens, type SchemaInterface } from 'ldkit';
import { SparqlEndpointFetcher } from 'fetch-sparql-endpoint';
import { error } from '@sveltejs/kit';
import { owlNs, schemaNs as schema, voidExtNs, voidNs } from '../rdf.js';
import { BaseDatasetSchema, BaseDistributionSchema } from './datasets.js';
import { shortenUri } from '$lib/utils/prefix';
import { isUri, lookupTermLabels } from './network-of-terms.js';
import { getLocale } from '$lib/paraglide/runtime';
import { REGISTRATION_STATUS_BASE_URI } from '@dataset-register/core/constants';
import {
  PUBLIC_SPARQL_ENDPOINT,
  PUBLIC_KNOWLEDGE_GRAPH_ENDPOINT,
} from '$env/static/public';
// Extended distribution schema with additional fields for detail view
const DetailDistributionSchema = {
  ...BaseDistributionSchema,
  accessURL: {
    '@id': dcat.accessURL,
  },
  description: {
    '@id': dcterms.description,
    '@optional': true,
    '@multilang': true,
  },
  issued: {
    '@id': dcterms.issued,
    '@type': xsd.dateTime,
    '@optional': true,
  },
  modified: {
    '@id': dcterms.modified,
    '@type': xsd.dateTime,
    '@optional': true,
  },
  byteSize: {
    '@id': dcat.byteSize,
    '@type': xsd.integer,
    '@optional': true,
  },
  conformsTo: {
    '@id': dcterms.conformsTo,
    '@optional': true,
    '@array': true,
  },
} as const;

// Extended publisher schema with additional fields for detail view
// Note: No @type specified to allow both foaf:Agent and foaf:Organization
const DetailPublisherSchema = {
  name: {
    '@id': foaf.name,
    '@multilang': true,
  },
  nick: {
    '@id': foaf.nick,
    '@optional': true,
    '@multilang': true,
  },
  email: {
    '@id': foaf.mbox,
    '@optional': true,
  },
  sameAs: {
    '@id': owlNs.sameAs,
    '@optional': true,
  },
} as const;

// Extended dataset schema for detail page
export const DatasetDetailSchema = {
  ...BaseDatasetSchema,
  keyword: {
    '@id': dcat.keyword,
    '@optional': true,
    '@array': true,
    '@multilang': true,
  },
  theme: {
    '@id': dcat.theme,
    '@optional': true,
    '@array': true,
  },
  type: {
    '@id': dcterms.type,
    '@optional': true,
    '@array': true,
    '@multilang': true,
  },
  spatial: {
    '@id': dcterms.spatial,
    '@optional': true,
    '@array': true,
  },
  // Note: dct:temporal is fetched separately (see fetchTemporalCoverage) because
  // the same predicate can carry three incompatible object shapes: an IRI, a
  // dct:PeriodOfTime blank node with dcat:startDate / dcat:endDate, or — for
  // unparseable inputs — a plain literal. ldkit cannot model this polymorphism
  // in a single schema.
  issued: {
    '@id': dcterms.issued,
    '@type': xsd.dateTime,
    '@optional': true,
  },
  modified: {
    '@id': dcterms.modified,
    '@type': xsd.dateTime,
    '@optional': true,
  },
  landingPage: {
    '@id': dcat.landingPage,
    '@optional': true,
  },
  publisher: {
    '@id': dcterms.publisher,
    '@optional': true,
    '@schema': DetailPublisherSchema,
  },
  subjectOf: {
    '@id': schema.subjectOf,
    '@schema': {
      '@type': schema.EntryPoint,
      datePosted: {
        '@id': schema.datePosted,
        '@type': xsd.dateTime,
      },
      dateRead: {
        '@id': schema.dateRead,
        '@type': xsd.dateTime,
        '@optional': true,
      },
      validUntil: {
        '@id': schema.validUntil,
        '@type': xsd.dateTime,
        '@optional': true,
      },
      additionalType: {
        '@id': schema.additionalType,
      },
    },
  },
  isPartOf: {
    '@id': dcterms.isPartOf,
    '@optional': true,
  },
  contentRating: {
    '@id': schema.contentRating,
    '@optional': true,
    '@schema': {
      ratingValue: {
        '@id': schema.ratingValue,
        '@type': xsd.integer,
      },
      worstRating: {
        '@id': schema.worstRating,
        '@type': xsd.integer,
      },
      bestRating: {
        '@id': schema.bestRating,
        '@type': xsd.integer,
      },
      ratingExplanation: {
        '@id': schema.ratingExplanation,
      },
    },
  },
} as const;

export type DatasetDetail = SchemaInterface<typeof DatasetDetailSchema>;
export type DistributionDetail = SchemaInterface<
  typeof DetailDistributionSchema
>;
export type Linkset = SchemaInterface<typeof LinksetSchema>;

// Linkset schema for terminology sources
export const LinksetSchema = {
  '@type': voidNs.Linkset,
  subjectsTarget: {
    '@id': voidNs.subjectsTarget,
    '@type': ldkit.IRI,
  },
  objectsTarget: {
    '@id': voidNs.objectsTarget,
    '@schema': {
      title: {
        '@id': dcterms.title,
        '@multilang': true,
      },
    },
  },
  triples: {
    '@id': voidNs.triples,
    '@type': xsd.integer,
  },
} as const;

// Distribution validation schema
const DatasetSummarySchema = {
  '@type': voidNs.Dataset,
  triples: {
    '@id': voidNs.triples,
    '@type': xsd.integer,
    '@optional': true,
  },
  distinctSubjects: {
    '@id': voidNs.distinctSubjects,
    '@type': xsd.integer,
    '@optional': true,
  },
  properties: {
    '@id': voidNs.properties,
    '@type': xsd.integer,
    '@optional': true,
  },
  distinctObjectsLiteral: {
    '@id': voidExtNs.distinctLiterals,
    '@type': xsd.integer,
    '@optional': true,
  },
  distinctObjectsURI: {
    '@id': voidExtNs.distinctIRIReferenceObjects,
    '@type': xsd.integer,
    '@optional': true,
  },
  propertyPartition: {
    '@id': voidNs.propertyPartition,
    '@optional': true,
    '@array': true,
    '@schema': {
      property: {
        '@id': voidNs.property,
      },
      entities: {
        '@id': voidNs.entities,
        '@type': xsd.integer,
      },
    },
  },
  // Note: classPartition is fetched separately to avoid Cartesian product
  // explosion with nested OPTIONALs (props × classes × nested props × datatypes × objectClasses = millions of rows)
  vocabulary: {
    '@id': voidNs.vocabulary,
    '@optional': true,
    '@array': true,
  },
  dataDump: {
    '@id': voidNs.dataDump,
    '@optional': true,
    '@array': true,
  },
  sparqlEndpoint: {
    '@id': voidNs.sparqlEndpoint,
    '@optional': true,
  },
} as const;

// Separate schema for classPartition to avoid Cartesian product explosion
// (nested OPTIONALs: classes × props × datatypes × objectClasses = millions of rows)
const ClassPartitionSchema = {
  '@type': voidNs.Dataset,
  classPartition: {
    '@id': voidNs.classPartition,
    '@optional': true,
    '@array': true,
    '@schema': {
      class: {
        '@id': voidNs.class,
      },
      entities: {
        '@id': voidNs.entities,
        '@type': xsd.integer,
      },
      propertyPartition: {
        '@id': voidNs.propertyPartition,
        '@optional': true,
        '@array': true,
        '@schema': {
          property: {
            '@id': voidNs.property,
          },
          entities: {
            '@id': voidNs.entities,
            '@type': xsd.integer,
          },
          distinctObjects: {
            '@id': voidNs.distinctObjects,
            '@type': xsd.integer,
          },
          datatypePartition: {
            '@id': voidExtNs.datatypePartition,
            '@optional': true,
            '@array': true,
            '@schema': {
              datatype: {
                '@id': voidExtNs.datatype,
              },
              triples: {
                '@id': voidNs.triples,
                '@type': xsd.integer,
              },
            },
          },
          objectClassPartition: {
            '@id': voidExtNs.objectClassPartition,
            '@optional': true,
            '@array': true,
            '@schema': {
              class: {
                '@id': voidNs.class,
              },
              triples: {
                '@id': voidNs.triples,
                '@type': xsd.integer,
              },
            },
          },
          languagePartition: {
            '@id': voidExtNs.languagePartition,
            '@optional': true,
            '@array': true,
            '@schema': {
              language: {
                '@id': voidExtNs.language,
              },
              triples: {
                '@id': voidNs.triples,
                '@type': xsd.integer,
              },
            },
          },
        },
      },
    },
  },
} as const;

type ClassPartitionResult = SchemaInterface<typeof ClassPartitionSchema>;

// Combined summary type that includes the separately-fetched classPartition
export type DatasetSummary = SchemaInterface<typeof DatasetSummarySchema> & {
  classPartition: ClassPartitionResult['classPartition'] | null;
};

const DISTRIBUTION_LIMIT = 20;

export type TemporalCoverage =
  | { kind: 'iri'; iri: string }
  | { kind: 'period'; iri?: string; start?: string; end?: string }
  | { kind: 'literal'; value: string };

export interface DatasetDetailResult {
  dataset: DatasetDetail;
  distributions: DistributionDetail[];
  totalDistributions: number;
  summary: DatasetSummary | null;
  linksets: Linkset[];
  temporalCoverages: TemporalCoverage[];
  resolvedTerms: Promise<Record<string, string>>;
}

const fetcher = new SparqlEndpointFetcher();

async function fetchDistributionCount(query: string): Promise<number> {
  const bindingsStream = await fetcher.fetchBindings(
    PUBLIC_SPARQL_ENDPOINT,
    query,
  );
  for await (const bindings of bindingsStream) {
    const typedBinding = bindings as unknown as {
      count?: { value: string };
    };
    if (typedBinding.count?.value) {
      return parseInt(typedBinding.count.value, 10);
    }
  }
  return 0;
}

async function fetchTemporalCoverage(
  datasetUri: string,
): Promise<TemporalCoverage[]> {
  const query = `
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX dcat: <http://www.w3.org/ns/dcat#>
    SELECT ?temporal ?startDate ?endDate WHERE {
      GRAPH ?g {
        <${datasetUri}> dct:temporal ?temporal .
        OPTIONAL { ?temporal dcat:startDate ?startDate }
        OPTIONAL { ?temporal dcat:endDate ?endDate }
      }
    }
  `;
  const bindingsStream = await fetcher.fetchBindings(
    PUBLIC_SPARQL_ENDPOINT,
    query,
  );

  const byKey = new Map<string, TemporalCoverage>();
  for await (const raw of bindingsStream) {
    const binding = raw as unknown as {
      temporal: { termType: string; value: string };
      startDate?: { value: string };
      endDate?: { value: string };
    };
    const { temporal, startDate, endDate } = binding;
    const key = `${temporal.termType}:${temporal.value}`;

    if (temporal.termType === 'Literal') {
      byKey.set(key, { kind: 'literal', value: temporal.value });
      continue;
    }

    const existing = byKey.get(key);
    if (startDate?.value || endDate?.value) {
      const period: TemporalCoverage = {
        kind: 'period',
        ...(temporal.termType === 'NamedNode' && { iri: temporal.value }),
        ...(existing?.kind === 'period' && existing),
        ...(startDate?.value && { start: startDate.value }),
        ...(endDate?.value && { end: endDate.value }),
      };
      byKey.set(key, period);
    } else if (!existing && temporal.termType === 'NamedNode') {
      byKey.set(key, { kind: 'iri', iri: temporal.value });
    }
  }
  return [...byKey.values()];
}

// Main function to fetch all dataset detail data
export async function fetchDatasetDetail(
  datasetUri: string,
): Promise<DatasetDetailResult> {
  // We intentionally don't pass SvelteKit's fetch to LDkit.
  // SvelteKit's fetch buffers entire response bodies for hydration serialization,
  // which breaks the streaming RDF parser and causes 10x slower performance
  // (~22s vs ~2.3s) on large SPARQL responses. Node's native fetch streams properly.
  // SSR still works: content is rendered server-side with native fetch.

  const detailLens = createLens(DatasetDetailSchema, {
    sources: [PUBLIC_SPARQL_ENDPOINT],
  });

  const summaryLens = createLens(DatasetSummarySchema, {
    sources: [PUBLIC_KNOWLEDGE_GRAPH_ENDPOINT],
  });

  const linksLens = createLens(LinksetSchema, {
    sources: [PUBLIC_KNOWLEDGE_GRAPH_ENDPOINT],
  });

  const classPartitionLens = createLens(ClassPartitionSchema, {
    sources: [PUBLIC_KNOWLEDGE_GRAPH_ENDPOINT],
  });

  const distributionLens = createLens(DetailDistributionSchema, {
    sources: [PUBLIC_SPARQL_ENDPOINT],
  });

  // Custom CONSTRUCT that sidesteps ldkit's auto-generated findByIri query.
  // ldkit's default places every property under OPTIONAL in a single BGP, which
  // Cartesian-products multi-valued properties (keyword, theme, spatial, etc.).
  // On a dataset with 20 keywords × 13 spatial × 9 themes, that produced
  // ~674k wire triples and a ~22s page load. Isolating each linked resource
  // (dataset, publisher, creator, subjectOf, contentRating) into its own UNION
  // branch keeps results proportional to the data (~200 triples, <1s).
  const datasetQuery = `
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX dcat: <http://www.w3.org/ns/dcat#>
    PREFIX schema: <https://schema.org/>
    PREFIX ldkit: <https://ldkit.io/ontology/>

    CONSTRUCT {
      ?s ?p ?o .
      <${datasetUri}> a ldkit:Resource .
    }
    WHERE {
      GRAPH ?g {
        {
          <${datasetUri}> ?p ?o .
          BIND(<${datasetUri}> AS ?s)
        } UNION {
          <${datasetUri}> dct:publisher ?publisher .
          ?publisher ?p ?o .
          BIND(?publisher AS ?s)
        } UNION {
          <${datasetUri}> dct:creator ?creator .
          ?creator ?p ?o .
          BIND(?creator AS ?s)
        } UNION {
          <${datasetUri}> schema:subjectOf ?subjectOf .
          ?subjectOf ?p ?o .
          BIND(?subjectOf AS ?s)
        } UNION {
          <${datasetUri}> schema:contentRating ?contentRating .
          ?contentRating ?p ?o .
          BIND(?contentRating AS ?s)
        }
      }
    }
  `;

  const distributionQuery = `
    PREFIX dcat: <http://www.w3.org/ns/dcat#>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX ldkit: <https://ldkit.io/ontology/>

    CONSTRUCT {
      ?distribution a dcat:Distribution, ldkit:Resource ;
        dcat:accessURL ?accessURL ;
        dct:description ?description ;
        dcat:mediaType ?rawMediaType ;
        dct:format ?format ;
        dct:issued ?issued ;
        dct:modified ?modified ;
        dcat:byteSize ?byteSize ;
        dct:conformsTo ?conformsTo ;
        dct:license ?license .
    }
    WHERE {
      GRAPH ?g {
        <${datasetUri}> dcat:distribution ?distribution .
        ?distribution dcat:accessURL ?accessURL .
        OPTIONAL { ?distribution dct:description ?description }
        OPTIONAL { ?distribution dcat:mediaType ?rawMediaType }
        OPTIONAL { ?distribution dct:format ?format }
        OPTIONAL { ?distribution dct:issued ?issued }
        OPTIONAL { ?distribution dct:modified ?modified }
        OPTIONAL { ?distribution dcat:byteSize ?byteSize }
        OPTIONAL { ?distribution dct:conformsTo ?conformsTo }
        OPTIONAL { ?distribution dct:license ?license }
      }
    }
    LIMIT ${DISTRIBUTION_LIMIT}
  `;

  const distributionCountQuery = `
    SELECT (COUNT(DISTINCT ?distribution) AS ?count)
    WHERE {
      GRAPH ?g {
        <${datasetUri}> <http://www.w3.org/ns/dcat#distribution> ?distribution .
      }
    }
  `;

  const [
    datasets,
    distributions,
    totalDistributions,
    summary,
    linksets,
    classPartitionResult,
    temporalCoverages,
  ] = await Promise.all([
    detailLens.query(datasetQuery),
    distributionLens.query(distributionQuery),
    fetchDistributionCount(distributionCountQuery),
    summaryLens.findByIri(datasetUri).catch((e: unknown) => {
      console.error(
        'Summary query failed:',
        e instanceof Error ? e.message : e,
      );
      return null;
    }),
    linksLens.find({ where: { subjectsTarget: datasetUri } }),
    classPartitionLens.findByIri(datasetUri),
    fetchTemporalCoverage(datasetUri),
  ]);

  const dataset = datasets.find((d) => d.$id === datasetUri) ?? datasets[0];
  if (!dataset) {
    error(404, 'Dataset not found');
  }

  // Merge classPartition into summary
  const summaryWithClassPartition = summary
    ? {
        ...summary,
        classPartition: classPartitionResult?.classPartition ?? null,
      }
    : null;

  // Resolve term URIs (e.g. spatial/temporal) to human-readable labels
  // via the Network of Terms API. Returned as an unawaited promise so
  // SvelteKit can stream the result without blocking the page response.
  const temporalIris = temporalCoverages.flatMap((coverage) =>
    coverage.kind === 'iri' || (coverage.kind === 'period' && coverage.iri)
      ? [(coverage as { iri: string }).iri].filter(isUri)
      : [],
  );
  const termUris = [...(dataset.spatial?.filter(isUri) ?? []), ...temporalIris];
  const resolvedTerms =
    termUris.length > 0
      ? lookupTermLabels(termUris, getLocale())
      : Promise.resolve({});

  return {
    dataset,
    distributions,
    totalDistributions,
    summary: summaryWithClassPartition,
    linksets,
    temporalCoverages,
    resolvedTerms,
  };
}

export function displayMissingProperties(ratingExplanation: string): string[] {
  return ratingExplanation
    .split(', ')
    .map((ratingExplanation) => shortenUri(ratingExplanation));
}

export type RegistrationStatus = 'gone' | 'invalid' | null;

/**
 * Extracts the registration status from the additionalType URI.
 * Returns 'gone', 'invalid', or null for valid/undefined statuses.
 */
export function getRegistrationStatus(
  additionalType: string | undefined | null,
): RegistrationStatus {
  if (!additionalType) return null;

  if (additionalType === `${REGISTRATION_STATUS_BASE_URI}gone`) {
    return 'gone';
  }
  if (additionalType === `${REGISTRATION_STATUS_BASE_URI}invalid`) {
    return 'invalid';
  }

  return null;
}
