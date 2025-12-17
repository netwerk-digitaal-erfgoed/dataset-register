import { dcat } from '@lde/dataset-registry-client';
import { dcterms, foaf, schema, xsd } from 'ldkit/namespaces';
import { createLens, type Options, type SchemaInterface } from 'ldkit';
import { error } from '@sveltejs/kit';
import { ndeNs, owlNs, voidNs } from '../rdf.js';
import { BaseDatasetSchema, BaseDistributionSchema } from './datasets.js';
import { shortenUri } from '$lib/utils/prefix';

export const DATASET_REGISTER_ENDPOINT =
  'https://datasetregister.netwerkdigitaalerfgoed.nl/sparql';
export const KNOWLEDGE_GRAPH_ENDPOINT =
  'https://triplestore.netwerkdigitaalerfgoed.nl/repositories/dataset-knowledge-graph';

// Extended distribution schema with additional fields for detail view
const DetailDistributionSchema = {
  ...BaseDistributionSchema,
  accessURL: {
    '@id': dcat.accessURL,
    '@optional': true,
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
export type DatasetSummary = SchemaInterface<typeof DatasetSummarySchema>;
export type Linkset = SchemaInterface<typeof LinksetSchema>;

// Linkset schema for terminology sources
export const LinksetSchema = {
  '@type': voidNs.Linkset,
  subjectsTarget: {
    '@id': voidNs.subjectsTarget,
  },
  objectsTarget: {
    '@id': voidNs.objectsTarget,
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
  classPartition: {
    '@id': voidNs.classPartition,
    '@optional': true,
    '@array': true,
    '@schema': {
      class: {
        '@id': voidNs.class,
        '@optional': true,
      },
      entities: {
        '@id': voidNs.entities,
        '@type': xsd.integer,
        '@optional': true,
      },
    },
  },
  vocabulary: {
    '@id': voidNs.vocabulary,
    '@optional': true,
    '@array': true,
  },
  dataDump: {
    '@id': voidNs.dataDump,
    '@optional': true,
    '@array': true,
    '@schema': {
      // '@type': ldkit.IRI,
      contentSize: {
        '@id': 'https://schema.org/contentSize',
        '@optional': true,
      },
      dateModified: {
        '@id': 'https://schema.org/dateModified',
        '@type': xsd.dateTime,
        '@optional': true,
      },
    },
  },
  sparqlEndpoint: {
    '@id': voidNs.sparqlEndpoint,
    '@optional': true,
  },
} as const;

export interface DatasetDetailResult {
  dataset: DatasetDetail;
  summary: DatasetSummary | null;
  linksets: Linkset[];
}

// Main function to fetch all dataset detail data
export async function fetchDatasetDetail(
  datasetUri: string,
  fetch?: typeof globalThis.fetch,
): Promise<DatasetDetailResult> {
  // Create lenses with custom fetch if provided
  // const options: Options = { logQuery: console.log };
  const options: Options = {};
  if (fetch) {
    options.fetch = fetch;
  }

  // We need to create the lenses dynamically to be able to pass Svelte’s fetch.
  const detailLens = createLens(DatasetDetailSchema, {
    sources: [DATASET_REGISTER_ENDPOINT],
    ...options,
  });

  const summaryLens = createLens(DatasetSummarySchema, {
    sources: [KNOWLEDGE_GRAPH_ENDPOINT],
    ...options,
  });

  const linksLens = createLens(LinksetSchema, {
    sources: [KNOWLEDGE_GRAPH_ENDPOINT],
    ...options,
  });

  const [dataset, summary, linksets] = await Promise.all([
    detailLens.findByIri(datasetUri),
    summaryLens.findByIri(datasetUri),
    linksLens.find({
      where: {
        subjectsTarget: datasetUri,
      },
    }),
  ]);

  if (!dataset) {
    error(404, 'Dataset not found');
  }

  return {
    dataset,
    summary,
    linksets,
  };
}

export function displayMissingProperties(ratingExplanation: string): string[] {
  return ratingExplanation
    .split(', ')
    .map((ratingExplanation) => shortenUri(ratingExplanation));
}
