import { dcat } from '@lde/dataset-registry-client';
import { dcterms, foaf, ldkit, schema, xsd } from 'ldkit/namespaces';
import { createLens, type SchemaInterface } from 'ldkit';
import { error } from '@sveltejs/kit';
import { ndeNs, owlNs, voidExtNs, voidNs } from '../rdf.js';
import { BaseDatasetSchema, BaseDistributionSchema } from './datasets.js';
import { shortenUri } from '$lib/utils/prefix';
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
  title: {
    '@id': dcterms.title,
    '@optional': true,
    '@multilang': true,
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
  identifier: {
    '@id': dcterms.identifier,
    '@optional': true,
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
  temporal: {
    '@id': dcterms.temporal,
    '@optional': true,
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
  landingPage: {
    '@id': 'http://www.w3.org/ns/dcat#landingPage',
    '@optional': true,
  },
  distribution: {
    '@id': dcat.distribution,
    '@optional': true,
    '@array': true,
    '@schema': DetailDistributionSchema,
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
    '@id': ndeNs.distinctObjectsLiteral,
    '@type': xsd.integer,
    '@optional': true,
  },
  distinctObjectsURI: {
    '@id': ndeNs.distinctObjectsURI,
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

export interface DatasetDetailResult {
  dataset: DatasetDetail;
  summary: DatasetSummary | null;
  linksets: Linkset[];
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

  const [dataset, summary, linksets, classPartitionResult] = await Promise.all([
    detailLens.findByIri(datasetUri),
    summaryLens.findByIri(datasetUri).catch((e: unknown) => {
      console.error('Summary query failed:', e instanceof Error ? e.message : e);
      return null;
    }),
    linksLens.find({ where: { subjectsTarget: datasetUri } }),
    classPartitionLens.findByIri(datasetUri),
  ]);

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

  return {
    dataset,
    summary: summaryWithClassPartition,
    linksets,
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
