/**
 * The shared `@lde/search` schema for the dataset search index.
 *
 * One `SearchType` declaration drives all three consumers – the indexer’s
 * projection + Typesense collection schema and the GraphQL query API – so they
 * cannot drift. It supersedes the hand-rolled {@link ./field-registry.ts}
 * registry, which stays in place until the browser query path moves onto the
 * GraphQL API (then the old registry and its direct-fetch path are removed).
 */

import { defineSearchType, type ProjectedNode } from '@lde/search';
import { stripIanaPrefix } from './media-types.ts';
import { deriveClassGroups } from './class-groups.ts';
import {
  isIiifMet,
  isLinkedDataMet,
  isPersistentUrisMet,
  isSchemaApNdeMet,
  isTermsMet,
} from './compatibility.ts';
import {
  type DatasetStatus,
  deriveStatus,
  formatGroups,
  STATUS_RANK,
  sumNumbers,
} from './derivations.ts';
// SEARCH_LOCALES has a single home in collections.ts (a node-free module the
// browser query path reads too); the schema imports it so the two sides cannot
// declare a different locale set.
import { SEARCH_LOCALES } from './collections.ts';

const DQV = 'http://www.w3.org/ns/dqv#';

/**
 * The `path` of a Dataset Knowledge Graph quality measurement: the hop from the
 * dataset to a measurement’s value.
 *
 * A measurement hangs off the dataset as `dqv:hasQualityMeasurement [
 * dqv:isMeasurementOf <metric> ; dqv:value ?v ]`, so selecting *one* metric
 * means constraining a **sibling** property of the intermediate node – which a
 * property path cannot express. This path states the hop only; which metric a
 * field takes is named on the field itself, and the DKG reader applies it when
 * it mints that field’s IR Alias. Every measurement field therefore shares this
 * same path, and the reader is what tells them apart.
 */
const MEASUREMENT_PATH = `<${DQV}hasQualityMeasurement>/<${DQV}value>`;

/**
 * Read a multi-valued field off the document as projected so far.
 *
 * A `derive` never reads the graph: every predicate it needs is declared as an
 * internal field above it (one with no role – see `isInternalField`), which the
 * projection populates and then prunes before the document reaches Typesense.
 * The projection already deduplicates and applies each field’s `transform`, so
 * these accessors only widen `unknown` back to the kind the field declares.
 */
function valuesOf(document: ProjectedNode, field: string): readonly string[] {
  return (document[field] as readonly string[] | undefined) ?? [];
}

/** Read a numeric field off the document; `null` when the predicate was absent. */
function numberOf(document: ProjectedNode, field: string): number | null {
  return (document[field] as number | undefined) ?? null;
}

/**
 * The conformance sample both `nde_schema_ap` and `linked_data` judge. Reading
 * it off the document needs no memo: the projection populates each internal
 * field once per dataset, so the two derives share that one read rather than
 * looking the predicates up again.
 */
function qualityMeasurements(document: ProjectedNode): {
  readonly quadsValidated: number | null;
  readonly conformant: boolean | null;
} {
  return {
    quadsValidated: numberOf(document, 'quads_validated'),
    conformant:
      (document.schema_ap_nde_conformant as boolean | undefined) ?? null,
  };
}

/** The RDF class the dataset search documents are instances of. */
export const DATASET_TYPE = 'http://www.w3.org/ns/dcat#Dataset';

/** The number of logarithmic size bins the size histogram/slider renders. */
const SIZE_BIN_COUNT = 10;

/**
 * Logarithmic `size` facet bins: bin n covers [10^n, 10^(n+1)); the top bin is
 * open-ended (≥ 10^9). The bucket key is the bin index the browser’s size slider
 * (`getBinLabel`) expects, so the query API returns the histogram directly.
 */
const SIZE_FACET_RANGES = Array.from({ length: SIZE_BIN_COUNT }, (_, bin) => ({
  key: String(bin),
  min: 10 ** bin,
  ...(bin < SIZE_BIN_COUNT - 1 ? { max: 10 ** (bin + 1) } : {}),
}));

const dataset = defineSearchType({
  name: 'Dataset',
  class: DATASET_TYPE,
  fields: [
    {
      name: 'title',
      kind: 'text',
      path: '<http://purl.org/dc/terms/title>',
      locales: SEARCH_LOCALES,
      output: true,
      searchable: { weight: 5 },
      sortable: true,
    },
    {
      name: 'description',
      kind: 'text',
      path: '<http://purl.org/dc/terms/description>',
      locales: SEARCH_LOCALES,
      output: true,
      searchable: { weight: 2 },
    },
    {
      // Publisher/creator names kept per-locale searchable (nl “instituut” vs en
      // “institute”), so a query ranks matches in the user’s language higher.
      name: 'publisherName',
      kind: 'text',
      path: '<http://purl.org/dc/terms/publisher>/<http://xmlns.com/foaf/0.1/name>',
      locales: SEARCH_LOCALES,
      searchable: { weight: 3 },
    },
    {
      name: 'creator',
      kind: 'text',
      path: '<http://purl.org/dc/terms/creator>/<http://xmlns.com/foaf/0.1/name>',
      locales: SEARCH_LOCALES,
      searchable: { weight: 2 },
    },
    {
      // The merged publisher + creator organization IRIs. Faceted on the IRI;
      // the display label resolves at query time from the Organization
      // collection (ADR 0008), so this carries no per-locale search field of
      // its own – that is `publisherName` above.
      name: 'publisher',
      kind: 'reference',
      path: '<http://purl.org/dc/terms/publisher>|<http://purl.org/dc/terms/creator>',
      array: true,
      facetable: true,
      filterable: true,
      output: true,
      ref: { typeName: 'Agent', strategy: 'labelOnly' },
      labelSource: 'Organization',
    },
    {
      // Filter-only IRI (the UI filters by catalog with an exact match but never
      // shows catalog buckets): filterable, not faceted, id-only (no label).
      name: 'catalog',
      kind: 'reference',
      path: '<http://purl.org/dc/terms/isPartOf>',
      array: true,
      filterable: true,
    },
    {
      // The partition class IRIs as the graph states them. Internal: `class`
      // below folds them together with the derived group tokens, and only that
      // combined field is faceted.
      name: 'class_iri',
      kind: 'reference',
      path: '<http://rdfs.org/ns/void#classPartition>/<http://rdfs.org/ns/void#class>',
      array: true,
    },
    {
      // Partition class IRIs plus the derived class-group tokens (`group:person`,
      // …) folded into one field, so a facet selection mixing granular classes
      // and group tokens UNIONs under the query API’s flat-AND `where` (a single
      // `class in [...]`). Facet-only, not output: the mixed IRI/token values
      // have no single reference shape, and the card never renders classes. The
      // group tokens resolve to no label (they are absent from the Class
      // collection); the browser renders them from its own translation table.
      name: 'class',
      kind: 'reference',
      array: true,
      facetable: true,
      filterable: true,
      labelSource: 'Class',
      derive: (document) => {
        const classes = valuesOf(document, 'class_iri');
        const combined = [...classes, ...deriveClassGroups(classes)];
        return combined.length > 0 ? combined : undefined;
      },
    },
    {
      name: 'terminology_source',
      kind: 'reference',
      path: '^<http://rdfs.org/ns/void#subjectsTarget>/<http://rdfs.org/ns/void#objectsTarget>',
      array: true,
      facetable: true,
      filterable: true,
      output: true,
      ref: { typeName: 'Vocabulary', strategy: 'labelOnly' },
      labelSource: 'TerminologySource',
    },
    {
      name: 'language',
      kind: 'keyword',
      path: '<http://purl.org/dc/terms/language>',
      array: true,
      facetable: true,
      output: true,
    },
    {
      // The distributions’ media types, IANA IRI prefix stripped by the field’s
      // own transform. Internal: `format` below folds them together with the
      // derived group tokens, and only that combined field is faceted.
      name: 'format_media_type',
      kind: 'keyword',
      path: '<http://www.w3.org/ns/dcat#distribution>/<http://www.w3.org/ns/dcat#mediaType>',
      array: true,
      transform: stripIanaPrefix,
    },
    {
      // The conformance IRIs a distribution declares (the SPARQL protocol among
      // them). Internal: read only to derive the `group:sparql` format token.
      name: 'conforms_to',
      kind: 'keyword',
      path: '<http://www.w3.org/ns/dcat#distribution>/<http://purl.org/dc/terms/conformsTo>',
      array: true,
    },
    {
      // Bare media types (the IANA IRI prefix stripped) plus the derived
      // format-group tokens (`group:rdf`/`group:sparql`) folded into one field,
      // so a facet selection mixing granular media types and group tokens UNIONs
      // under the query API’s flat-AND `where` (a single `format in [...]`).
      // Output so the card can rebuild its distribution badges from it.
      name: 'format',
      kind: 'keyword',
      array: true,
      facetable: true,
      filterable: true,
      output: true,
      derive: (document) => {
        const mediaTypes = valuesOf(document, 'format_media_type');
        const groups = formatGroups(
          mediaTypes,
          valuesOf(document, 'conforms_to'),
        );
        const combined = [...mediaTypes, ...groups];
        return combined.length > 0 ? combined : undefined;
      },
    },
    {
      name: 'date_posted',
      kind: 'date',
      path: '<https://schema.org/datePosted>',
      sortable: true,
      output: true,
    },
    {
      name: 'size',
      kind: 'integer',
      path: '<http://rdfs.org/ns/void#triples>',
      facetable: true,
      filterable: true,
      sortable: true,
      output: true,
      // Logarithmic size bins (bin n covers [10^n, 10^(n+1)); bin 9 is open-ended
      // ≥ 1e9), so the query API returns the histogram the size slider renders. The
      // bucket key is the bin index the UI’s getBinLabel expects.
      facetRanges: SIZE_FACET_RANGES,
    },

    // --- Derived fields (computed from several predicates / earlier fields) ---
    {
      // The status markers the register stamps on a dataset (gone/invalid).
      // Internal: `status` below reduces them to a single token.
      name: 'additional_type',
      kind: 'reference',
      path: '<https://schema.org/additionalType>',
      array: true,
    },
    {
      // Kept a keyword rather than a date: `deriveStatus` only tests presence,
      // and a `date` field would coerce it to Unix seconds for no purpose.
      name: 'valid_until',
      kind: 'keyword',
      path: '<https://schema.org/validUntil>',
    },
    {
      name: 'status',
      kind: 'keyword',
      facetable: true,
      filterable: true,
      required: true,
      output: true,
      derive: (document) =>
        deriveStatus(
          valuesOf(document, 'additional_type'),
          document.valid_until as string | undefined,
        ),
    },
    {
      name: 'status_rank',
      kind: 'integer',
      sortable: true,
      required: true,
      derive: (document) => STATUS_RANK[document.status as DatasetStatus],
    },
    {
      // The IIIF subsets’ `void:entities` counts, one per subset. Internal:
      // `iiif_manifest_count` sums them. A `keyword` array rather than an
      // `integer`, which would project only the first subset’s count.
      name: 'iiif_entities',
      kind: 'keyword',
      path: '<http://rdfs.org/ns/void#subset>/<http://rdfs.org/ns/void#entities>',
      array: true,
    },
    {
      // Declared IIIF manifest count (sum of the IIIF subsets’ void:entities);
      // shown on the card when positive. Not a facet.
      name: 'iiif_manifest_count',
      kind: 'integer',
      output: true,
      derive: (document) => {
        const count = sumNumbers(valuesOf(document, 'iiif_entities'));
        return count > 0 ? count : undefined;
      },
    },
    // NDE compatibility (“vinkjes”): each set to true only when met, else absent
    // (so a faceted `field:=true` count is the number of compliant datasets).
    {
      name: 'manifests_sampled',
      kind: 'integer',
      path: MEASUREMENT_PATH,
    },
    {
      name: 'manifests_validated',
      kind: 'integer',
      path: MEASUREMENT_PATH,
    },
    {
      name: 'iiif',
      kind: 'boolean',
      facetable: true,
      output: true,
      derive: (document) =>
        isIiifMet({
          declared: numberOf(document, 'iiif_manifest_count') ?? 0,
          sampled: numberOf(document, 'manifests_sampled'),
          validated: numberOf(document, 'manifests_validated'),
        })
          ? true
          : undefined,
    },
    {
      name: 'quads_validated',
      kind: 'integer',
      path: MEASUREMENT_PATH,
    },
    {
      name: 'schema_ap_nde_conformant',
      kind: 'boolean',
      path: MEASUREMENT_PATH,
    },
    {
      name: 'nde_schema_ap',
      kind: 'boolean',
      facetable: true,
      // Filterable so the browser’s “automated checks” facet can narrow the
      // listing to the conforming datasets (`where: {nde_schema_ap: true}`), not
      // just count them.
      filterable: true,
      output: true,
      derive: (document) =>
        isSchemaApNdeMet(qualityMeasurements(document)) ? true : undefined,
    },
    {
      name: 'linked_data',
      kind: 'boolean',
      facetable: true,
      derive: (document) =>
        isLinkedDataMet({
          triples: numberOf(document, 'size'),
          ...qualityMeasurements(document),
        })
          ? true
          : undefined,
    },
    {
      name: 'terms',
      kind: 'boolean',
      facetable: true,
      derive: (document) =>
        isTermsMet(valuesOf(document, 'terminology_source').length)
          ? true
          : undefined,
    },
    {
      name: 'subject_uris_sampled',
      kind: 'integer',
      path: MEASUREMENT_PATH,
    },
    {
      name: 'subject_uris_resolved',
      kind: 'integer',
      path: MEASUREMENT_PATH,
    },
    {
      name: 'subject_namespace_durable',
      kind: 'boolean',
      path: MEASUREMENT_PATH,
    },
    {
      // Durable polarity: the DKG emits `false` only when the namespace is on
      // its non-durable disallow list; absent (or non-false) means durable.
      name: 'persistent_uris',
      kind: 'boolean',
      facetable: true,
      derive: (document) =>
        isPersistentUrisMet({
          sampled: numberOf(document, 'subject_uris_sampled'),
          resolved: numberOf(document, 'subject_uris_resolved'),
          durable: document.subject_namespace_durable !== false,
        })
          ? true
          : undefined,
    },
  ],
});

// The RDF classes the three label-source collections are instances of. Exported
// so the indexer can pull each `SearchType` off SEARCH_SCHEMA by IRI and inject
// the matching `rdf:type` when projecting the label quads into its collection.
export const ORGANIZATION_TYPE = 'https://schema.org/Organization';
export const CLASS_TYPE = 'http://www.w3.org/2000/01/rdf-schema#Class';
export const TERMINOLOGY_SOURCE_TYPE =
  'http://www.w3.org/2004/02/skos/core#ConceptScheme';

/**
 * A label-source collection (ADR 0008): the referenced organizations, carrying
 * a per-locale `label` the engine resolves publisher facet buckets and hit
 * references against. Not searched as an entity itself in this profile.
 */
const organization = defineSearchType({
  name: 'Organization',
  class: ORGANIZATION_TYPE,
  fields: [
    {
      name: 'label',
      kind: 'text',
      path: '<http://xmlns.com/foaf/0.1/name>',
      locales: SEARCH_LOCALES,
      output: true,
      searchable: { weight: 1 },
    },
  ],
});

/** Label source for the `class` facet: the partition classes and their labels. */
const rdfClass = defineSearchType({
  name: 'Class',
  class: CLASS_TYPE,
  fields: [
    {
      name: 'label',
      kind: 'text',
      path: '<http://www.w3.org/2000/01/rdf-schema#label>',
      locales: SEARCH_LOCALES,
      output: true,
      searchable: { weight: 1 },
    },
  ],
});

/** Label source for the `terminology_source` facet: the linked vocabularies. */
const terminologySource = defineSearchType({
  name: 'TerminologySource',
  class: TERMINOLOGY_SOURCE_TYPE,
  fields: [
    {
      name: 'label',
      kind: 'text',
      path: '<http://purl.org/dc/terms/title>',
      locales: SEARCH_LOCALES,
      output: true,
      searchable: { weight: 1 },
    },
  ],
});

/**
 * The declarations the search schema is built over, in one array.
 *
 * Exported because a **schema-declaration module** – the file the prebuilt LDE
 * indexer and search-API images mount – default-exports exactly this: the
 * declarations as plain data, ahead of any `searchSchema` call. Keeping the
 * array as the single listing means the mounted module and {@link SEARCH_SCHEMA}
 * cannot come to hold different types.
 */
export const SEARCH_TYPES = [
  dataset,
  organization,
  rdfClass,
  terminologySource,
] as const;

