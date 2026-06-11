import { dcat } from '@lde/dataset-registry-client';
import { dcterms, foaf, ldkit, xsd } from 'ldkit/namespaces';
import { createLens, type SchemaInterface } from 'ldkit';
import { SparqlEndpointFetcher } from 'fetch-sparql-endpoint';
import { error } from '@sveltejs/kit';
import {
  owlNs,
  schemaNs as schema,
  vcardNs,
  voidExtNs,
  voidNs,
} from '../rdf.js';
import { BaseDatasetSchema, BaseDistributionSchema } from './datasets.js';
import { shortenUri } from '$lib/utils/prefix';
import { isUri, lookupTermLabels } from './network-of-terms.js';
import {
  IIIF_PRESENTATION_API,
  PID_SCHEME_BASE_URI,
  type IiifManifests,
  type LinkedData,
  type PersistentUris,
  type PidScheme,
  type TermLinks,
} from './nde-compatibility.js';
import { offersLinkedData } from '$lib/utils/distribution';
import { normalizeMediaType } from '$lib/utils/sparql';
import { getLocale } from '$lib/paraglide/runtime';
import {
  REGISTRATION_STATUS_BASE_URI,
  REGISTRATION_WARNING_COUNT_PREDICATE,
  VALIDATION_WARNINGS_RATING_TYPE,
} from '@dataset-register/core/constants';
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
  documentation: {
    '@id': foaf.page,
    '@optional': true,
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
  sameAs: {
    '@id': owlNs.sameAs,
    '@optional': true,
  },
} as const;

// Contact point schema — the canonical location of the dataset's contact email.
// vcard:hasEmail is stored as a mailto: IRI; UI strips the prefix for display.
const DetailContactPointSchema = {
  email: {
    '@id': vcardNs.hasEmail,
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
  contactPoint: {
    '@id': dcat.contactPoint,
    '@optional': true,
    '@schema': DetailContactPointSchema,
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
      // How many sh:Warning results the registration's description produced at
      // the last crawl. Surfaces "registered with warnings" on the detail page;
      // tracked per registration, not per dataset.
      warningCount: {
        '@id': REGISTRATION_WARNING_COUNT_PREDICATE,
        '@type': xsd.integer,
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
  // When the Knowledge Graph last generated the summary (ISO dateTime from the
  // DKG's PROV-O provenance), or null when no provenance has been recorded.
  summaryGeneratedAt: string | null;
  linksets: Linkset[];
  temporalCoverages: TemporalCoverage[];
  iiifManifests: IiifManifests;
  persistentUris: PersistentUris;
  linkedData: LinkedData;
  terms: TermLinks | null;
  resolvedTerms: Promise<Record<string, string>>;
  // Per-dataset SHACL warning count, feeding the registration criterion's
  // warning tier. 0 when the description validated cleanly or predates the count.
  warningCount: number;
}

const fetcher = new SparqlEndpointFetcher();

// Reads the IIIF manifest figures from the Knowledge Graph: the declared count
// (void:subset keyed on dcterms:conformsTo, counted with void:entities) plus the
// validation measurements (how many manifests were sampled and how many of those
// resolved to a valid IIIF Presentation manifest). sampled/validated are null
// when no validation measurement has been recorded yet.
async function fetchIiifManifests(datasetUri: string): Promise<IiifManifests> {
  const query = `
    PREFIX void: <http://rdfs.org/ns/void#>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX dqv: <http://www.w3.org/ns/dqv#>
    PREFIX nde: <https://def.nde.nl/metric#>
    SELECT ?declared ?sampled ?validated WHERE {
      <${datasetUri}> void:subset [
        dct:conformsTo <${IIIF_PRESENTATION_API}> ;
        void:entities ?declared
      ] .
      OPTIONAL {
        <${datasetUri}> dqv:hasQualityMeasurement [
          dqv:isMeasurementOf nde:manifests-sampled ;
          dqv:value ?sampled
        ]
      }
      OPTIONAL {
        <${datasetUri}> dqv:hasQualityMeasurement [
          dqv:isMeasurementOf nde:manifests-validated ;
          dqv:value ?validated
        ]
      }
    }
    LIMIT 1
  `;
  const none: IiifManifests = { declared: 0, sampled: null, validated: null };
  try {
    const bindingsStream = await fetcher.fetchBindings(
      PUBLIC_KNOWLEDGE_GRAPH_ENDPOINT,
      query,
    );
    for await (const raw of bindingsStream) {
      const binding = raw as unknown as {
        declared?: { value: string };
        sampled?: { value: string };
        validated?: { value: string };
      };
      return {
        declared: binding.declared?.value
          ? parseInt(binding.declared.value, 10)
          : 0,
        sampled: binding.sampled?.value
          ? parseInt(binding.sampled.value, 10)
          : null,
        validated: binding.validated?.value
          ? parseInt(binding.validated.value, 10)
          : null,
      };
    }
  } catch (e: unknown) {
    console.error(
      'IIIF manifests query failed:',
      e instanceof Error ? e.message : e,
    );
  }
  return none;
}

// Reads the persistent-URI figures from the Knowledge Graph for the dataset’s
// most common self-minted subject namespace. The DKG records the resolution
// measurements (`subject-uris-sampled`/`subject-uris-resolved`) on a `void:subset`
// scoped to that namespace, plus a recognised PID scheme (`dcterms:conformsTo`)
// and its issuing `dcterms:publisher` (ARK) as positive embellishments, and a
// `subject-uris-persistent` boolean flag (`false`) when the namespace is on the
// disallow list. The sampled measurement keys the join, so the right subset is
// selected even when the dataset has other subsets (e.g. IIIF). Every field is
// null/false when no such subset has been recorded yet.
async function fetchPersistentUris(
  datasetUri: string,
): Promise<PersistentUris> {
  const none: PersistentUris = {
    uriSpace: null,
    scheme: null,
    publisher: null,
    sampled: null,
    resolved: null,
    onDisallowList: false,
  };
  const query = `
    PREFIX void: <http://rdfs.org/ns/void#>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX dqv: <http://www.w3.org/ns/dqv#>
    PREFIX nde: <https://def.nde.nl/metric#>
    SELECT ?uriSpace ?scheme ?publisher ?sampled ?resolved ?persistent WHERE {
      <${datasetUri}> void:subset ?ns .
      ?ns void:uriSpace ?uriSpace ;
        dqv:hasQualityMeasurement [
          dqv:isMeasurementOf nde:subject-uris-sampled ;
          dqv:value ?sampled
        ] .
      OPTIONAL {
        ?ns dqv:hasQualityMeasurement [
          dqv:isMeasurementOf nde:subject-uris-resolved ;
          dqv:value ?resolved
        ]
      }
      OPTIONAL {
        ?ns dqv:hasQualityMeasurement [
          dqv:isMeasurementOf nde:subject-uris-persistent ;
          dqv:value ?persistent
        ]
      }
      OPTIONAL {
        ?ns dct:conformsTo ?scheme .
        FILTER(STRSTARTS(STR(?scheme), "${PID_SCHEME_BASE_URI}"))
      }
      OPTIONAL { ?ns dct:publisher ?publisher }
    }
    LIMIT 1
  `;
  try {
    const bindingsStream = await fetcher.fetchBindings(
      PUBLIC_KNOWLEDGE_GRAPH_ENDPOINT,
      query,
    );
    for await (const raw of bindingsStream) {
      const binding = raw as unknown as {
        uriSpace?: { value: string };
        scheme?: { value: string };
        publisher?: { value: string };
        sampled?: { value: string };
        resolved?: { value: string };
        persistent?: { value: string };
      };
      return {
        uriSpace: binding.uriSpace?.value ?? null,
        scheme: parsePidScheme(binding.scheme?.value),
        publisher: binding.publisher?.value ?? null,
        sampled: binding.sampled?.value
          ? parseInt(binding.sampled.value, 10)
          : null,
        resolved: binding.resolved?.value
          ? parseInt(binding.resolved.value, 10)
          : null,
        // The DKG emits the persistent flag as `false` only for a namespace on
        // its disallow list; absence means unflagged. Dormant until the DKG ships
        // the measurement (see dataset-knowledge-graph).
        onDisallowList: binding.persistent?.value === 'false',
      };
    }
  } catch (e: unknown) {
    console.error(
      'Persistent URIs query failed:',
      e instanceof Error ? e.message : e,
    );
  }
  return none;
}

// Maps a `https://def.nde.nl/pid-scheme#…` IRI to its recognised scheme, or null
// when there is no scheme or it is one we do not recognise.
function parsePidScheme(schemeIri: string | undefined): PidScheme | null {
  switch (schemeIri) {
    case `${PID_SCHEME_BASE_URI}ark`:
      return 'ark';
    case `${PID_SCHEME_BASE_URI}handle`:
      return 'handle';
    default:
      return null;
  }
}

// Reads the SCHEMA-AP-NDE sample conformance for a dataset from the Knowledge
// Graph. Both co-emitted measurements are needed: the `conformant` boolean is
// only conclusive when `quadsValidated` > 0, since a `true` over zero validated
// quads is vacuous (no resources of the profile’s classes were sampled). The
// Linked data criterion uses the pair to split a confirmed profile (🟢) from a
// warning (🟠). Each field is null when its measurement does not exist yet.
async function fetchSchemaApNdeConformance(
  datasetUri: string,
): Promise<{ conformant: boolean | null; quadsValidated: number | null }> {
  const none = { conformant: null, quadsValidated: null };
  const query = `
    PREFIX dqv: <http://www.w3.org/ns/dqv#>
    PREFIX nde: <https://def.nde.nl/metric#>
    SELECT ?conformant ?quadsValidated WHERE {
      OPTIONAL {
        <${datasetUri}> dqv:hasQualityMeasurement
          [ dqv:isMeasurementOf nde:schema-ap-nde-sample-conformance ; dqv:value ?conformant ] .
      }
      OPTIONAL {
        <${datasetUri}> dqv:hasQualityMeasurement
          [ dqv:isMeasurementOf nde:quads-validated ; dqv:value ?quadsValidated ] .
      }
    }
    LIMIT 1
  `;
  try {
    const bindingsStream = await fetcher.fetchBindings(
      PUBLIC_KNOWLEDGE_GRAPH_ENDPOINT,
      query,
    );
    for await (const raw of bindingsStream) {
      const binding = raw as unknown as {
        conformant?: { value: string };
        quadsValidated?: { value: string };
      };
      return {
        conformant: binding.conformant?.value
          ? binding.conformant.value === 'true'
          : null,
        quadsValidated: binding.quadsValidated?.value
          ? parseInt(binding.quadsValidated.value, 10)
          : null,
      };
    }
  } catch (e: unknown) {
    console.error(
      'SCHEMA-AP-NDE conformance query failed:',
      e instanceof Error ? e.message : e,
    );
  }
  return none;
}

// Reads when the Knowledge Graph last generated this dataset's summary, from the
// PROV-O provenance the DKG records. The DKG runs many analysis steps, each
// emitting its own prov:Activity (linked via prov:wasGeneratedBy) with a
// prov:endedAtTime; the latest of those marks the most recent generation. Returns
// null when no provenance has been recorded yet.
async function fetchSummaryGeneratedAt(
  datasetUri: string,
): Promise<string | null> {
  const query = `
    PREFIX prov: <http://www.w3.org/ns/prov#>
    SELECT (MAX(?ended) AS ?generatedAt) WHERE {
      <${datasetUri}> prov:wasGeneratedBy ?activity .
      ?activity prov:endedAtTime ?ended .
    }
  `;
  try {
    const bindingsStream = await fetcher.fetchBindings(
      PUBLIC_KNOWLEDGE_GRAPH_ENDPOINT,
      query,
    );
    for await (const raw of bindingsStream) {
      const binding = raw as unknown as {
        generatedAt?: { value: string };
      };
      return binding.generatedAt?.value ?? null;
    }
  } catch (e: unknown) {
    console.error(
      'Summary generated-at query failed:',
      e instanceof Error ? e.message : e,
    );
  }
  return null;
}

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
          # Only the completeness rating, not the validation-warnings rating
          # (read separately), so the single-valued contentRating lens stays correct.
          <${datasetUri}> schema:contentRating ?contentRating .
          FILTER NOT EXISTS {
            ?contentRating schema:additionalType <${VALIDATION_WARNINGS_RATING_TYPE}> .
          }
          ?contentRating ?p ?o .
          BIND(?contentRating AS ?s)
        } UNION {
          <${datasetUri}> dcat:contactPoint ?contactPoint .
          ?contactPoint ?p ?o .
          BIND(?contactPoint AS ?s)
        }
      }
    }
  `;

  const distributionQuery = `
    PREFIX dcat: <http://www.w3.org/ns/dcat#>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX ldkit: <https://ldkit.io/ontology/>

    CONSTRUCT {
      ?distribution a dcat:Distribution, ldkit:Resource ;
        dcat:accessURL ?accessURL ;
        foaf:page ?landingPage ;
        dct:description ?description ;
        dcat:mediaType ?mediaType ;
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
        OPTIONAL { ?distribution foaf:page ?landingPage }
        OPTIONAL { ?distribution dct:description ?description }
        OPTIONAL {
          ?distribution dcat:mediaType ?rawMediaType .
          ${normalizeMediaType('?rawMediaType', '?mediaType')}
        }
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
    summaryGeneratedAt,
    temporalCoverages,
    iiifManifests,
    persistentUris,
    schemaApNdeConformance,
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
    // The terms criterion depends on the linksets, so a Knowledge Graph failure
    // here must not fail the whole page. Catch it and treat the result as
    // unavailable (null), distinct from an empty result: the terms criterion is
    // then left indeterminate rather than read as “no links to terms”.
    linksLens
      .find({ where: { subjectsTarget: datasetUri } })
      .catch((e: unknown) => {
        console.error(
          'Linkset query failed:',
          e instanceof Error ? e.message : e,
        );
        return null;
      }),
    classPartitionLens.findByIri(datasetUri),
    fetchSummaryGeneratedAt(datasetUri),
    fetchTemporalCoverage(datasetUri),
    fetchIiifManifests(datasetUri),
    fetchPersistentUris(datasetUri),
    fetchSchemaApNdeConformance(datasetUri),
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

  // The Linked data criterion: whether a linked-data distribution is declared in
  // the register (reusing the same RDF notion as the search facet, over the
  // distributions already loaded), whether the Knowledge Graph produced a
  // void:Dataset with content, and whether that content conforms to SCHEMA-AP-NDE.
  const linkedData: LinkedData = {
    declared: offersLinkedData(distributions),
    hasVoidDataset: summaryWithClassPartition !== null,
    hasContent: hasLinkedDataContent(summaryWithClassPartition),
    conformant: schemaApNdeConformance.conformant,
    quadsValidated: schemaApNdeConformance.quadsValidated,
    triples: summaryWithClassPartition?.triples ?? null,
  };

  // Term-usage figures for the NDE compatibility criterion, reusing the data
  // already fetched: `links` is the client-side sum of the linksets’
  // void:triples, `distinctObjectsUri` the top-level VoID’s distinct-URI-objects
  // count. The criterion is left indeterminate (null) — and so omitted, never
  // rendered red — when there is no top-level VoID or the linksets could not be
  // retrieved.
  const terms: TermLinks | null =
    summaryWithClassPartition === null || linksets === null
      ? null
      : {
          links: linksets.reduce(
            (total, linkset) => total + linkset.triples,
            0,
          ),
          distinctObjectsUri:
            summaryWithClassPartition.distinctObjectsURI ?? null,
        };

  // Resolve term URIs (e.g. spatial/temporal) to human-readable labels
  // via the Network of Terms API. Returned as an unawaited promise so
  // SvelteKit can stream the result without blocking the page response.
  const temporalIris = temporalCoverages.flatMap((coverage) =>
    coverage.kind === 'iri' || (coverage.kind === 'period' && coverage.iri)
      ? [(coverage as { iri: string }).iri].filter(isUri)
      : [],
  );
  const termUris = [
    ...(dataset.spatial?.filter(isUri) ?? []),
    ...temporalIris,
    ...(dataset.theme?.filter(isUri) ?? []),
  ];
  const resolvedTerms =
    termUris.length > 0
      ? lookupTermLabels(termUris, getLocale())
      : Promise.resolve({});

  return {
    dataset,
    distributions,
    totalDistributions,
    summary: summaryWithClassPartition,
    summaryGeneratedAt,
    linksets: linksets ?? [],
    temporalCoverages,
    iiifManifests,
    persistentUris,
    linkedData,
    terms,
    resolvedTerms,
    // The registration's warning count (from its last crawl); 0 when the
    // registration recorded none or predates warning storage.
    warningCount: dataset.subjectOf?.warningCount ?? 0,
  };
}

// Whether the dataset has been analyzed by the Dataset Knowledge Graph. The DKG
// produces a VoID summary only once it has crawled the dataset, so its presence
// signals that the dataset was analyzed. The NDE compatibility criteria are
// assessed from that analysis, so they are only shown for an analyzed dataset.
export function isAnalyzed(summary: DatasetSummary | null): boolean {
  return summary !== null;
}

// Whether the Knowledge Graph extracted any linked-data content for the dataset.
// A composite test rather than void:triples alone: large datasets can have a
// full class partition (or distinct subjects) yet a missing triples aggregate,
// so any of the three signals counts as content.
export function hasLinkedDataContent(summary: DatasetSummary | null): boolean {
  return (
    summary !== null &&
    ((summary.triples ?? 0) > 0 ||
      (summary.classPartition?.length ?? 0) > 0 ||
      (summary.distinctSubjects ?? 0) > 0)
  );
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
