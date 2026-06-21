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
  SUBJECT_RESOLUTION_FAILURE_BASE_URI,
  type IiifManifests,
  type LinkedData,
  type PersistentUriFailure,
  type PersistentUriFailureReason,
  type PersistentUris,
  type PidScheme,
  type TermLinks,
} from './nde-compatibility.js';
import { offersLinkedData } from '$lib/utils/distribution';
import type {
  DistributionHealth,
  ValidityVerdict,
} from './distribution-health.js';
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
  // Per-distribution health from the register's own probe, keyed by access URL.
  // An unawaited promise so SvelteKit streams it: the page renders immediately
  // and the distribution status and download links update reactively once it
  // resolves. Decoupled from the main distribution query.
  distributionHealth: Promise<Map<string, DistributionHealth>>;
  // Per-distribution RDF-validity verdicts (the validity rail), keyed by access
  // URL. Each access URL may carry more than one verdict – a shallow one from the
  // register and a deep one from the Dataset Knowledge Graph – which the usability
  // rollup reconciles (deep beats shallow, stale decays to unknown). An unawaited
  // promise, streamed alongside distributionHealth.
  distributionValidity: Promise<Map<string, ValidityVerdict[]>>;
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
// `subject-namespace-durable` boolean flag (`false`) when the namespace is on the
// disallow list, and a `subject-uris-sampling-failed` boolean (`true`) when the
// sample query failed every attempt. A resolution outcome — the sampled ratio or
// the sampling-failed marker — keys the join, so the right subset is selected
// even when the dataset has other subsets (e.g. IIIF) and even when sampling
// produced no ratio. Every field is null/false when no such subset exists yet.
async function fetchPersistentUris(
  datasetUri: string,
): Promise<PersistentUris> {
  const none: PersistentUris = {
    uriSpace: null,
    scheme: null,
    publisher: null,
    sampled: null,
    resolved: null,
    htmlLandingPages: null,
    onDisallowList: false,
    // The per-URI failures are fetched separately (fetchPersistentUriFailures)
    // and merged in by fetchDatasetDetail; this query does not read them.
    failures: [],
    samplingFailed: false,
  };
  const query = `
    PREFIX void: <http://rdfs.org/ns/void#>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX dqv: <http://www.w3.org/ns/dqv#>
    PREFIX nde: <https://def.nde.nl/metric#>
    SELECT ?uriSpace ?scheme ?publisher ?sampled ?resolved ?htmlLandingPages ?durable ?samplingFailed WHERE {
      <${datasetUri}> void:subset ?ns .
      ?ns void:uriSpace ?uriSpace .
      OPTIONAL {
        ?ns dqv:hasQualityMeasurement [
          dqv:isMeasurementOf nde:subject-uris-sampled ;
          dqv:value ?sampled
        ]
      }
      OPTIONAL {
        ?ns dqv:hasQualityMeasurement [
          dqv:isMeasurementOf nde:subject-uris-resolved ;
          dqv:value ?resolved
        ]
      }
      OPTIONAL {
        ?ns dqv:hasQualityMeasurement [
          dqv:isMeasurementOf nde:subject-uris-html-landing-pages ;
          dqv:value ?htmlLandingPages
        ]
      }
      OPTIONAL {
        ?ns dqv:hasQualityMeasurement [
          dqv:isMeasurementOf nde:subject-uris-sampling-failed ;
          dqv:value ?samplingFailed
        ]
      }
      OPTIONAL {
        ?ns dqv:hasQualityMeasurement [
          dqv:isMeasurementOf nde:subject-namespace-durable ;
          dqv:value ?durable
        ]
      }
      OPTIONAL {
        ?ns dct:conformsTo ?scheme .
        FILTER(STRSTARTS(STR(?scheme), "${PID_SCHEME_BASE_URI}"))
      }
      OPTIONAL { ?ns dct:publisher ?publisher }
      # The winner subset is the one carrying a resolution outcome — a sampled
      # ratio or the sampling-failed marker — not just any uriSpace subset.
      FILTER(BOUND(?sampled) || BOUND(?samplingFailed))
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
        htmlLandingPages?: { value: string };
        durable?: { value: string };
        samplingFailed?: { value: string };
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
        // Subset of `resolved` that served an HTML landing page; null when the
        // DKG has not emitted the measurement (old data), which suppresses the
        // no-html-landing-pages advisory rather than firing it on absence.
        htmlLandingPages: binding.htmlLandingPages?.value
          ? parseInt(binding.htmlLandingPages.value, 10)
          : null,
        // The DKG emits the durability flag as `false` only for a namespace on
        // its disallow list; absence means unflagged. Dormant until the DKG ships
        // the measurement (see dataset-knowledge-graph).
        onDisallowList: binding.durable?.value === 'false',
        // Merged in by fetchDatasetDetail from fetchPersistentUriFailures.
        failures: [],
        // The DKG emits this `true` only when the sample query failed every
        // attempt; absence (or a never-sampled namespace) leaves it false.
        samplingFailed: binding.samplingFailed?.value === 'true',
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

// Maps a `https://def.nde.nl/subject-resolution-failure#…` IRI to its reason, or
// null for an unrecognised reason (skipped, so an unknown concept never surfaces
// as a blank or misleading row).
function parseFailureReason(
  reasonIri: string | undefined,
): PersistentUriFailureReason | null {
  switch (reasonIri) {
    case `${SUBJECT_RESOLUTION_FAILURE_BASE_URI}no-self-reference`:
      return 'no-self-reference';
    case `${SUBJECT_RESOLUTION_FAILURE_BASE_URI}http-error`:
      return 'http-error';
    case `${SUBJECT_RESOLUTION_FAILURE_BASE_URI}timeout`:
      return 'timeout';
    case `${SUBJECT_RESOLUTION_FAILURE_BASE_URI}network-error`:
      return 'network-error';
    case `${SUBJECT_RESOLUTION_FAILURE_BASE_URI}wrong-content-type`:
      return 'wrong-content-type';
    default:
      return null;
  }
}

// Reads the per-URI subject-resolution failures the Knowledge Graph records on
// the dataset’s subject namespace. The DKG enumerates only the failed samples
// (successful ones are not listed), each as a `prov:Usage` carrying the failed
// URI (`prov:entity`) and a typed `failure:reason`. The forward path anchors on
// the `subject-uris-sampled` measurement specifically — not just any measurement
// on the subset — because that measurement and `subject-uris-resolved` are both
// generated by the *same* activity that holds the usages; matching either would
// bind the activity twice and duplicate every failed URI. Anchoring on the one
// sampled measurement (plus SELECT DISTINCT as a guard) keeps each URI once.
// Selecting via this subset also picks the right namespace when the dataset has
// other subsets (e.g. IIIF); the reason-namespace FILTER drops any non-resolution
// usages on the activity. Returns [] until the DKG ships the data, on error, or
// when nothing failed.
async function fetchPersistentUriFailures(
  datasetUri: string,
): Promise<PersistentUriFailure[]> {
  const query = `
    PREFIX void: <http://rdfs.org/ns/void#>
    PREFIX dqv: <http://www.w3.org/ns/dqv#>
    PREFIX nde: <https://def.nde.nl/metric#>
    PREFIX prov: <http://www.w3.org/ns/prov#>
    PREFIX failure: <https://def.nde.nl/failure#>
    SELECT DISTINCT ?uri ?reason WHERE {
      <${datasetUri}> void:subset ?ns .
      ?ns dqv:hasQualityMeasurement ?measurement .
      ?measurement dqv:isMeasurementOf nde:subject-uris-sampled ;
        prov:wasGeneratedBy ?activity .
      ?activity prov:qualifiedUsage ?usage .
      ?usage prov:entity ?uri ;
        failure:reason ?reason .
      FILTER(STRSTARTS(STR(?reason), "${SUBJECT_RESOLUTION_FAILURE_BASE_URI}"))
    }
  `;
  const failures: PersistentUriFailure[] = [];
  try {
    const bindingsStream = await fetcher.fetchBindings(
      PUBLIC_KNOWLEDGE_GRAPH_ENDPOINT,
      query,
    );
    for await (const raw of bindingsStream) {
      const binding = raw as unknown as {
        uri?: { value: string };
        reason?: { value: string };
      };
      const reason = parseFailureReason(binding.reason?.value);
      if (binding.uri?.value && reason !== null) {
        failures.push({ uri: binding.uri.value, reason });
      }
    }
  } catch (e: unknown) {
    console.error(
      'Persistent URI failures query failed:',
      e instanceof Error ? e.message : e,
    );
  }
  return failures;
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

// Reads the register's own per-distribution health records for every
// distribution of a dataset, keyed by access URL. Records live in their own
// named graph (nde-probe:DistributionHealthRecord); the type triple is unique to
// that graph, so matching on it keeps the query portable across environments
// without hard-coding the graph IRI. Distributions the probe has never recorded
// simply have no record and are absent from the map (classified as “unknown”).
// On failure it returns an empty map, so the page degrades to “unknown” status
// rather than wrongly disabling downloads.
async function fetchDistributionHealth(
  datasetUri: string,
): Promise<Map<string, DistributionHealth>> {
  const query = `
    PREFIX dcat: <http://www.w3.org/ns/dcat#>
    PREFIX nde-probe: <https://def.nde.nl/probe#>
    SELECT ?accessURL ?lastProbedAt ?lastOutcome ?lastSuccessAt ?firstFailureAt ?consecutiveFailures ?sourceFingerprint
    WHERE {
      GRAPH ?datasetGraph {
        <${datasetUri}> dcat:distribution ?distribution .
        ?distribution dcat:accessURL ?accessURL .
      }
      GRAPH ?healthGraph {
        ?accessURL a nde-probe:DistributionHealthRecord ;
            nde-probe:lastProbedAt ?lastProbedAt ;
            nde-probe:consecutiveFailures ?consecutiveFailures .
        OPTIONAL { ?accessURL nde-probe:lastOutcome ?lastOutcome }
        OPTIONAL { ?accessURL nde-probe:lastSuccessAt ?lastSuccessAt }
        OPTIONAL { ?accessURL nde-probe:firstFailureAt ?firstFailureAt }
        OPTIONAL { ?accessURL nde-probe:sourceFingerprint ?sourceFingerprint }
      }
    }
  `;
  const byUrl = new Map<string, DistributionHealth>();
  try {
    const bindingsStream = await fetcher.fetchBindings(
      PUBLIC_SPARQL_ENDPOINT,
      query,
    );
    for await (const raw of bindingsStream) {
      const binding = raw as unknown as {
        accessURL: { value: string };
        lastProbedAt: { value: string };
        lastOutcome?: { value: string };
        lastSuccessAt?: { value: string };
        firstFailureAt?: { value: string };
        consecutiveFailures: { value: string };
        sourceFingerprint?: { value: string };
      };
      byUrl.set(binding.accessURL.value, {
        lastOutcome: binding.lastOutcome?.value ?? null,
        lastProbedAt: new Date(binding.lastProbedAt.value),
        lastSuccessAt: binding.lastSuccessAt?.value
          ? new Date(binding.lastSuccessAt.value)
          : null,
        firstFailureAt: binding.firstFailureAt?.value
          ? new Date(binding.firstFailureAt.value)
          : null,
        consecutiveFailures: parseInt(binding.consecutiveFailures.value, 10),
        sourceFingerprint: binding.sourceFingerprint?.value ?? null,
      });
    }
  } catch (e: unknown) {
    console.error(
      'Distribution health query failed:',
      e instanceof Error ? e.message : e,
    );
  }
  return byUrl;
}

// Reads the per-distribution RDF-validity verdicts (the validity rail) for every
// distribution of a dataset, keyed by access URL. Federates two producers: the
// register's own shallow measurements (PUBLIC_SPARQL_ENDPOINT) and the Dataset
// Knowledge Graph's deep ones (PUBLIC_KNOWLEDGE_GRAPH_ENDPOINT). Both write the
// same DQV/PROV shape under def.nde.nl; depth is read from which endpoint served
// the measurement, not from the RDF. Each source is queried independently and
// failures degrade to "no verdict" (the usability rollup then yields "unknown")
// rather than breaking the page.
async function fetchDistributionValidity(
  datasetUri: string,
): Promise<Map<string, ValidityVerdict[]>> {
  const byUrl = new Map<string, ValidityVerdict[]>();
  const [shallow, deep] = await Promise.all([
    fetchValidityVerdicts(datasetUri, PUBLIC_SPARQL_ENDPOINT, 'shallow'),
    fetchValidityVerdicts(datasetUri, PUBLIC_KNOWLEDGE_GRAPH_ENDPOINT, 'deep'),
  ]);
  for (const [url, verdicts] of [...shallow, ...deep]) {
    for (const verdict of verdicts) appendVerdict(byUrl, url, verdict);
  }
  return byUrl;
}

// One row of the validity measurement query.
interface ValidityBinding {
  accessURL: { value: string };
  value: { value: string };
  fingerprint?: { value: string };
  reason?: { value: string };
  message?: { value: string };
}

async function fetchValidityVerdicts(
  datasetUri: string,
  endpoint: string,
  depth: ValidityVerdict['depth'],
): Promise<Map<string, ValidityVerdict[]>> {
  // The register (shallow) stores datasets and validity measurements in named
  // graphs, so the query must name them — exactly as fetchDistributionHealth
  // does. The Knowledge Graph (deep) serves the default graph, so its query is
  // unscoped, matching the other DKG queries in this file. Using GRAPH blocks on
  // the register endpoint is what makes the shallow rail resolve at all.
  const datasetPattern = `
      <${datasetUri}> dcat:distribution ?distribution .
      ?distribution dcat:accessURL ?accessURL .`;
  const measurementPattern = `
      ?measurement dqv:computedOn ?accessURL ;
          dqv:isMeasurementOf metric:distribution-rdf-valid ;
          dqv:value ?value .
      OPTIONAL { ?measurement probe:sourceFingerprint ?fingerprint }
      OPTIONAL {
        ?measurement prov:wasGeneratedBy ?activity .
        ?activity prov:qualifiedUsage ?usage .
        ?usage failure:reason ?reason .
        OPTIONAL { ?usage failure:message ?message }
      }`;
  const where =
    depth === 'shallow'
      ? `GRAPH ?datasetGraph {${datasetPattern}
      }
      GRAPH ?validityGraph {${measurementPattern}
      }`
      : `${datasetPattern}${measurementPattern}`;
  const query = `
    PREFIX dcat: <http://www.w3.org/ns/dcat#>
    PREFIX dqv: <http://www.w3.org/ns/dqv#>
    PREFIX prov: <http://www.w3.org/ns/prov#>
    PREFIX failure: <https://def.nde.nl/failure#>
    PREFIX probe: <https://def.nde.nl/probe#>
    PREFIX metric: <https://def.nde.nl/metric#>
    SELECT DISTINCT ?accessURL ?value ?fingerprint ?reason ?message
    WHERE {
      ${where}
    }
  `;
  const byUrl = new Map<string, ValidityVerdict[]>();
  try {
    const bindingsStream = await fetcher.fetchBindings(endpoint, query);
    for await (const raw of bindingsStream) {
      const binding = raw as unknown as ValidityBinding;
      const verdict = toValidityVerdict(binding, depth);
      if (verdict === null) continue;
      appendVerdict(byUrl, binding.accessURL.value, verdict);
    }
  } catch (error: unknown) {
    console.error(
      `Distribution validity query (${depth}) failed:`,
      error instanceof Error ? error.message : error,
    );
  }
  return byUrl;
}

// Append a verdict to the multimap of verdicts-by-access-URL, creating the entry
// on first use.
function appendVerdict(
  byUrl: Map<string, ValidityVerdict[]>,
  url: string,
  verdict: ValidityVerdict,
): void {
  const verdicts = byUrl.get(url);
  if (verdicts === undefined) {
    byUrl.set(url, [verdict]);
  } else {
    verdicts.push(verdict);
  }
}

// Reconstruct a ValidityVerdict from a DQV-measurement binding. The reason's
// local name (after the scheme's #) is the verdict reason, matching the
// distribution-validity-failure scheme the producers write.
function toValidityVerdict(
  binding: ValidityBinding,
  depth: ValidityVerdict['depth'],
): ValidityVerdict | null {
  // xsd:boolean has two lexical forms per endpoint; accept both 'true' and '1'.
  const valid = binding.value.value === 'true' || binding.value.value === '1';
  const verdict: ValidityVerdict = {
    valid,
    validatedFingerprint: binding.fingerprint?.value ?? null,
    depth,
  };
  if (!valid) {
    const reason = binding.reason?.value.split('#').pop();
    if (reason === 'parse-error' || reason === 'empty') {
      verdict.reason = reason;
    }
    if (binding.message?.value !== undefined) {
      verdict.message = binding.message.value;
    }
  }
  return verdict;
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

  // Fire the distribution-health query eagerly, in parallel with the page load
  // and decoupled from the main distribution query. It is returned unawaited so
  // the page renders without waiting on it; the status and download links update
  // reactively once it resolves.
  const distributionHealth = fetchDistributionHealth(datasetUri);
  // Likewise stream the validity rail; the usability rollup combines it with the
  // health (reachability) signal once both resolve.
  const distributionValidity = fetchDistributionValidity(datasetUri);

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
    persistentUriFailures,
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
    fetchPersistentUriFailures(datasetUri),
    fetchSchemaApNdeConformance(datasetUri),
  ]);

  const dataset = datasets.find((d) => d.$id === datasetUri) ?? datasets[0];
  if (!dataset) {
    error(404, 'Dataset not found');
  }

  // Merge the separately-fetched per-URI failures into the persistent-URI
  // figures, so the criterion can split a soft “resolves but no PID reference”
  // from a hard “did not resolve” and list the failing URIs.
  const persistentUrisWithFailures: PersistentUris = {
    ...persistentUris,
    failures: persistentUriFailures,
  };

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
    persistentUris: persistentUrisWithFailures,
    linkedData,
    terms,
    resolvedTerms,
    distributionHealth,
    distributionValidity,
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
