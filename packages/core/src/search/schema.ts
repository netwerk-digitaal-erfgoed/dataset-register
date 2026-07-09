/**
 * The shared `@lde/search` schema for the dataset search index.
 *
 * One `SearchType` declaration drives all three consumers – the indexer’s
 * projection + Typesense collection schema and the GraphQL query API – so they
 * cannot drift. It supersedes the hand-rolled {@link ./field-registry.ts}
 * registry, which stays in place until the browser query path moves onto the
 * GraphQL API (then the old registry and its direct-fetch path are removed).
 */

import {
  defineSearchType,
  firstLiteralOf,
  irisOf,
  literalsOf,
  searchSchema,
} from '@lde/search';
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
  parseBoolean,
  parseNumber,
  STATUS_RANK,
  sumNumbers,
} from './derivations.ts';
// SEARCH_LOCALES has a single home in field-registry.ts (the browser query path
// reads it too); the schema-driven projection imports it so the two sides cannot
// declare a different locale set.
import { SEARCH_LOCALES } from './field-registry.ts';

/** schema.org and the register-internal IR predicate prefixes. */
const SCHEMA = 'https://schema.org/';
const DR = 'urn:dr:';

/** The RDF class the dataset search documents are instances of. */
export const DATASET_TYPE = 'http://www.w3.org/ns/dcat#Dataset';

const dataset = defineSearchType({
  name: 'Dataset',
  type: DATASET_TYPE,
  fields: [
    {
      name: 'title',
      kind: 'text',
      path: 'http://purl.org/dc/terms/title',
      locales: SEARCH_LOCALES,
      output: true,
      searchable: { weight: 5 },
      sortable: true,
    },
    {
      name: 'description',
      kind: 'text',
      path: 'http://purl.org/dc/terms/description',
      locales: SEARCH_LOCALES,
      output: true,
      searchable: { weight: 2 },
    },
    {
      // A faceted tag list, not language-tagged prose: one folded, searchable
      // value list (`keyword_search`) plus the facet (`keyword`).
      name: 'keyword',
      kind: 'keyword',
      path: 'http://www.w3.org/ns/dcat#keyword',
      array: true,
      facetable: true,
      searchable: { weight: 1 },
    },
    {
      // Publisher/creator names kept per-locale searchable (nl “instituut” vs en
      // “institute”), so a query ranks matches in the user’s language higher.
      name: 'publisherName',
      kind: 'text',
      path: 'urn:dr:publisherName',
      locales: SEARCH_LOCALES,
      searchable: { weight: 3 },
    },
    {
      name: 'creator',
      kind: 'text',
      path: 'urn:dr:creatorName',
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
      path: 'urn:dr:organization',
      array: true,
      facetable: true,
      output: true,
      ref: { typeName: 'Agent', strategy: 'labelOnly' },
      labelSource: 'Organization',
    },
    {
      // Filter-only IRI (the UI filters by catalog with an exact match but never
      // shows catalog buckets): filterable, not faceted, id-only (no label).
      name: 'catalog',
      kind: 'reference',
      path: 'urn:dr:catalog',
      array: true,
      filterable: true,
    },
    {
      name: 'class',
      kind: 'reference',
      path: 'urn:dr:class',
      array: true,
      facetable: true,
      output: true,
      ref: { typeName: 'RdfClass', strategy: 'labelOnly' },
      labelSource: 'Class',
    },
    {
      name: 'terminology_source',
      kind: 'reference',
      path: 'urn:dr:terminologySource',
      array: true,
      facetable: true,
      output: true,
      ref: { typeName: 'Vocabulary', strategy: 'labelOnly' },
      labelSource: 'TerminologySource',
    },
    {
      name: 'language',
      kind: 'keyword',
      path: 'http://purl.org/dc/terms/language',
      array: true,
      facetable: true,
    },
    {
      // Media types, normalized to the bare `type/subtype` (the IANA IRI prefix
      // stripped) so granular format buckets match across sources.
      name: 'format',
      kind: 'keyword',
      path: 'urn:dr:format',
      array: true,
      facetable: true,
      transform: stripIanaPrefix,
    },
    {
      name: 'date_posted',
      kind: 'date',
      path: 'urn:dr:datePosted',
      sortable: true,
    },
    {
      name: 'size',
      kind: 'integer',
      path: 'urn:dr:size',
      facetable: true,
      sortable: true,
    },

    // --- Derived fields (computed from several predicates / earlier fields) ---
    {
      name: 'status',
      kind: 'keyword',
      facetable: true,
      required: true,
      derive: (node) =>
        deriveStatus(
          irisOf(node, `${SCHEMA}additionalType`),
          firstLiteralOf(node, `${DR}validUntil`),
        ),
    },
    {
      name: 'status_rank',
      kind: 'integer',
      sortable: true,
      required: true,
      derive: (_node, document) =>
        STATUS_RANK[document.status as DatasetStatus],
    },
    {
      name: 'format_group',
      kind: 'keyword',
      array: true,
      facetable: true,
      derive: (node, document) => {
        const groups = formatGroups(
          (document.format as string[] | undefined) ?? [],
          literalsOf(node, `${DR}conformsTo`),
        );
        return groups.length > 0 ? groups : undefined;
      },
    },
    {
      name: 'class_group',
      kind: 'keyword',
      array: true,
      facetable: true,
      derive: (_node, document) => {
        const groups = deriveClassGroups(
          (document.class as string[] | undefined) ?? [],
        );
        return groups.length > 0 ? groups : undefined;
      },
    },
    {
      // Declared IIIF manifest count (sum of the IIIF subsets’ void:entities);
      // shown on the card when positive. Not a facet.
      name: 'iiif_manifest_count',
      kind: 'integer',
      derive: (node) => {
        const count = sumNumbers(literalsOf(node, `${DR}iiifEntities`));
        return count > 0 ? count : undefined;
      },
    },
    // NDE compatibility (“vinkjes”): each set to true only when met, else absent
    // (so a faceted `field:=true` count is the number of compliant datasets).
    {
      name: 'iiif',
      kind: 'boolean',
      facetable: true,
      derive: (node, document) =>
        isIiifMet({
          declared: (document.iiif_manifest_count as number | undefined) ?? 0,
          sampled: parseNumber(firstLiteralOf(node, `${DR}manifestsSampled`)),
          validated: parseNumber(
            firstLiteralOf(node, `${DR}manifestsValidated`),
          ),
        })
          ? true
          : undefined,
    },
    {
      name: 'nde_schema_ap',
      kind: 'boolean',
      facetable: true,
      derive: (node) =>
        isSchemaApNdeMet({
          quadsValidated: parseNumber(
            firstLiteralOf(node, `${DR}quadsValidated`),
          ),
          conformant: parseBoolean(
            firstLiteralOf(node, `${DR}schemaApNdeConformant`),
          ),
        })
          ? true
          : undefined,
    },
    {
      name: 'linked_data',
      kind: 'boolean',
      facetable: true,
      derive: (node, document) =>
        isLinkedDataMet({
          triples: (document.size as number | undefined) ?? null,
          quadsValidated: parseNumber(
            firstLiteralOf(node, `${DR}quadsValidated`),
          ),
          conformant: parseBoolean(
            firstLiteralOf(node, `${DR}schemaApNdeConformant`),
          ),
        })
          ? true
          : undefined,
    },
    {
      name: 'terms',
      kind: 'boolean',
      facetable: true,
      derive: (_node, document) =>
        isTermsMet(
          (document.terminology_source as string[] | undefined)?.length ?? 0,
        )
          ? true
          : undefined,
    },
    {
      // Durable polarity: the DKG emits `false` only when the namespace is on
      // its non-durable disallow list; absent (or non-false) means durable.
      name: 'persistent_uris',
      kind: 'boolean',
      facetable: true,
      derive: (node) =>
        isPersistentUrisMet({
          sampled: parseNumber(firstLiteralOf(node, `${DR}subjectUrisSampled`)),
          resolved: parseNumber(
            firstLiteralOf(node, `${DR}subjectUrisResolved`),
          ),
          durable:
            parseBoolean(firstLiteralOf(node, `${DR}subjectNamespaceDurable`)) !==
            false,
        })
          ? true
          : undefined,
    },
  ],
});

/**
 * A label-source collection (ADR 0008): the referenced organizations, carrying
 * a per-locale `label` the engine resolves publisher facet buckets and hit
 * references against. Not searched as an entity itself in this profile.
 */
const organization = defineSearchType({
  name: 'Organization',
  type: 'https://schema.org/Organization',
  fields: [
    {
      name: 'label',
      kind: 'text',
      path: 'http://xmlns.com/foaf/0.1/name',
      locales: SEARCH_LOCALES,
      output: true,
      searchable: { weight: 1 },
    },
  ],
});

/** Label source for the `class` facet: the partition classes and their labels. */
const rdfClass = defineSearchType({
  name: 'Class',
  type: 'http://www.w3.org/2000/01/rdf-schema#Class',
  fields: [
    {
      name: 'label',
      kind: 'text',
      path: 'http://www.w3.org/2000/01/rdf-schema#label',
      locales: SEARCH_LOCALES,
      output: true,
      searchable: { weight: 1 },
    },
  ],
});

/** Label source for the `terminology_source` facet: the linked vocabularies. */
const terminologySource = defineSearchType({
  name: 'TerminologySource',
  type: 'http://www.w3.org/2004/02/skos/core#ConceptScheme',
  fields: [
    {
      name: 'label',
      kind: 'text',
      path: 'http://purl.org/dc/terms/title',
      locales: SEARCH_LOCALES,
      output: true,
      searchable: { weight: 1 },
    },
  ],
});

/** The search schema shared by the indexer and the GraphQL query API. */
export const SEARCH_SCHEMA = searchSchema(
  dataset,
  organization,
  rdfClass,
  terminologySource,
);
