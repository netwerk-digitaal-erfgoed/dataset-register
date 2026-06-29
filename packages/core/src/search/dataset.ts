import {
  irisOf,
  firstLiteralOf,
  literalsOf,
  type FramedNode,
  type SearchDocument,
  type SearchSchema,
} from '@lde/search';
import { REGISTRATION_STATUS_BASE_URI } from '../constants.js';
import { deriveClassGroups } from './class-groups.js';
import {
  FORMAT_GROUP_RDF,
  FORMAT_GROUP_SPARQL,
  GROUP_PREFIX,
  RDF_MEDIA_TYPES,
  SPARQL_PROTOCOL_URI,
  stripIanaPrefix,
} from './media-types.js';
import {
  isIiifMet,
  isLinkedDataMet,
  isPersistentUrisMet,
  isSchemaApNdeMet,
  isTermsMet,
} from './compatibility.js';

const DCT = 'http://purl.org/dc/terms/';
const DCAT = 'http://www.w3.org/ns/dcat#';
const SCHEMA = 'https://schema.org/';
/** Register-internal IR predicates: promoted registration facts + DKG facets. */
const DR = 'urn:dr:';

/**
 * The single unified search declaration for `dcat:Dataset` — the one source that
 * drives projection (RDF → index), the Typesense collection schema, the query
 * semantics, and the GraphQL surface (`@lde/search*`). It folds the former
 * `DATASET_PROJECTION` (field-to-predicate mapping + derivations) and
 * `SEARCH_FIELDS` (Typesense field types + weights + facets) into one model;
 * field names are camelCase (verbatim GraphQL field names) and the physical
 * fanout / Typesense types are derived by the engine, never re-declared.
 *
 * Captured `as const satisfies SearchSchema` so the GraphQL surface can derive
 * typed facet/output keys from it. Deployment deltas live here, not in
 * `@lde/search`: the `status_rank` tie-break sort, the `*_group` grouped facets,
 * and the NDE compatibility booleans.
 */
export const DATASET = {
  type: `${DCAT}Dataset`,
  fields: [
    // --- Localized text (display + folded per-locale search/sort) ---
    {
      name: 'title',
      path: `${DCT}title`,
      kind: 'text',
      localized: true,
      locales: ['nl', 'en'],
      output: true,
      searchable: { weight: 5 },
      sortable: true,
    },
    {
      name: 'description',
      path: `${DCT}description`,
      kind: 'text',
      localized: true,
      locales: ['nl', 'en'],
      output: true,
      searchable: { weight: 2 },
    },
    // Search-only: the publisher/creator names feed full-text `query_by`; the
    // publisher OUTPUT is the reference below (resolved to a label), and creator
    // has no output of its own — mirroring the card.
    {
      name: 'publisher',
      path: `${DR}publisherName`,
      kind: 'text',
      localized: true,
      locales: ['nl', 'en'],
      searchable: { weight: 3 },
    },
    {
      name: 'creator',
      path: `${DR}creatorName`,
      kind: 'text',
      localized: true,
      locales: ['nl', 'en'],
      searchable: { weight: 2 },
    },

    // --- Keyword / reference facets ---
    {
      name: 'keyword',
      path: `${DCAT}keyword`,
      kind: 'keyword',
      array: true,
      facetable: true,
      filterable: true,
      output: true,
      searchable: { weight: 1 },
    },
    {
      name: 'publisher',
      path: `${DR}organization`,
      kind: 'reference',
      array: true,
      facetable: true,
      filterable: true,
      output: true,
      ref: { type: 'Organization', strategy: 'labelOnly' },
    },
    // Filter-only, non-facet: the listing filters by catalog but never shows
    // catalog counts; an IRI, matched exactly (non-facet → exact membership).
    {
      name: 'catalog',
      path: `${DR}catalog`,
      kind: 'reference',
      array: true,
      filterable: true,
      ref: { type: 'Catalog', strategy: 'idOnly' },
    },
    {
      name: 'format',
      path: `${DR}format`,
      kind: 'keyword',
      array: true,
      facetable: true,
      filterable: true,
      output: true,
      transform: stripIanaPrefix,
      group: { name: 'format_group', prefix: GROUP_PREFIX },
    },
    {
      name: 'language',
      path: `${DCT}language`,
      kind: 'keyword',
      array: true,
      facetable: true,
      filterable: true,
      output: true,
    },
    {
      name: 'class',
      path: `${DR}class`,
      kind: 'reference',
      array: true,
      facetable: true,
      filterable: true,
      output: true,
      ref: { type: 'Class', strategy: 'labelOnly' },
      group: { name: 'class_group', prefix: GROUP_PREFIX },
    },
    {
      name: 'terminologySource',
      path: `${DR}terminologySource`,
      kind: 'reference',
      array: true,
      facetable: true,
      filterable: true,
      output: true,
      ref: { type: 'Term', strategy: 'labelOnly' },
    },

    // --- Numeric / date ---
    { name: 'datePosted', path: `${DR}datePosted`, kind: 'date', sortable: true, output: true },
    // int64 magnitude (triple count) → `number` so the GraphQL surface emits Float,
    // not 32-bit Int.
    {
      name: 'size',
      path: `${DR}size`,
      kind: 'number',
      facetable: true,
      filterable: true,
      sortable: true,
      output: true,
    },

    // --- Derived fields (no path; populated by the derivations below) ---
    {
      name: 'status',
      kind: 'keyword',
      facetable: true,
      filterable: true,
      required: true,
      output: true,
    },
    // The default sorting field (browse order); internal, not an output field.
    { name: 'statusRank', kind: 'integer', sortable: true },
    // Declared IIIF manifest count, shown on the card; not a facet.
    { name: 'iiifManifestCount', kind: 'integer', output: true },
    // NDE compatibility “vinkjes”.
    { name: 'iiif', kind: 'boolean', facetable: true, filterable: true, output: true },
    { name: 'ndeSchemaAp', kind: 'boolean', facetable: true, filterable: true, output: true },
    { name: 'linkedData', kind: 'boolean', facetable: true, filterable: true, output: true },
    { name: 'terms', kind: 'boolean', facetable: true, filterable: true, output: true },
    { name: 'persistentUris', kind: 'boolean', facetable: true, filterable: true, output: true },
  ],

  derivations: [
    // Registration status + its sort rank, from the promoted registration facts.
    (document: SearchDocument, node: FramedNode) => {
      const status = deriveStatus(
        irisOf(node, `${SCHEMA}additionalType`),
        firstLiteralOf(node, `${DR}validUntil`),
      );
      document.status = status;
      document.statusRank = STATUS_RANK[status];
    },
    // Grouped format facet (group:sparql / group:rdf) alongside the granular media types.
    (document: SearchDocument, node: FramedNode) => {
      const groups = formatGroups(
        (document.format as string[] | undefined) ?? [],
        literalsOf(node, `${DR}conformsTo`),
      );
      if (groups.length > 0) {
        document.format_group = groups;
      }
    },
    // Grouped class facet, derived from the granular DKG class IRIs.
    (document: SearchDocument) => {
      const groups = deriveClassGroups(
        (document.class as string[] | undefined) ?? [],
      );
      if (groups.length > 0) {
        document.class_group = groups;
      }
    },
    // NDE compatibility booleans + the declared IIIF manifest count, from the
    // merged DKG DQV measurements. Each boolean is set only when its criterion is
    // met (the field is optional, so absent reads as not-met).
    (document: SearchDocument, node: FramedNode) => {
      const iiifManifestCount = sumNumbers(literalsOf(node, `${DR}iiifEntities`));
      if (iiifManifestCount > 0) {
        document.iiifManifestCount = iiifManifestCount;
      }
      if (
        isIiifMet({
          declared: iiifManifestCount,
          sampled: parseNumber(firstLiteralOf(node, `${DR}manifestsSampled`)),
          validated: parseNumber(firstLiteralOf(node, `${DR}manifestsValidated`)),
        })
      ) {
        document.iiif = true;
      }

      const quadsValidated = parseNumber(firstLiteralOf(node, `${DR}quadsValidated`));
      const schemaApNdeConformant = parseBoolean(
        firstLiteralOf(node, `${DR}schemaApNdeConformant`),
      );
      if (isSchemaApNdeMet({ quadsValidated, conformant: schemaApNdeConformant })) {
        document.ndeSchemaAp = true;
      }

      if (
        isLinkedDataMet({
          // dr:size is void:triples – the strongest DKG content signal.
          triples: (document.size as number | undefined) ?? null,
          quadsValidated,
          conformant: schemaApNdeConformant,
        })
      ) {
        document.linkedData = true;
      }

      if (
        isTermsMet(
          (document.terminologySource as string[] | undefined)?.length ?? 0,
        )
      ) {
        document.terms = true;
      }

      // Durable polarity: the DKG emits `false` only when the namespace is on its
      // non-durable disallow list; absent (or any non-false value) means durable.
      const namespaceFlag = parseBoolean(
        firstLiteralOf(node, `${DR}subjectNamespaceDurable`),
      );
      if (
        isPersistentUrisMet({
          sampled: parseNumber(firstLiteralOf(node, `${DR}subjectUrisSampled`)),
          resolved: parseNumber(firstLiteralOf(node, `${DR}subjectUrisResolved`)),
          durable: namespaceFlag !== false,
        })
      ) {
        document.persistentUris = true;
      }
    },
  ],
} as const satisfies SearchSchema;

/** The field Typesense sorts by when no text query orders the results — the
 *  derived `statusRank`. (The collection/labels aliases live in field-registry.) */
export const DATASET_DEFAULT_SORTING_FIELD = 'statusRank';

export type DatasetStatus = 'valid' | 'archived' | 'invalid' | 'gone';

/** Lower rank sorts first when browsing without a text query. */
const STATUS_RANK: Readonly<Record<DatasetStatus, number>> = {
  valid: 0,
  archived: 1,
  invalid: 2,
  gone: 3,
};

const STATUS_IRI: Readonly<Record<Exclude<DatasetStatus, 'archived'>, string>> = {
  valid: `${REGISTRATION_STATUS_BASE_URI}valid`,
  invalid: `${REGISTRATION_STATUS_BASE_URI}invalid`,
  gone: `${REGISTRATION_STATUS_BASE_URI}gone`,
};

/** `gone` and `invalid` status markers win over an archival `validUntil`. */
export function deriveStatus(
  additionalTypes: readonly string[],
  validUntilIso: string | undefined,
): DatasetStatus {
  if (additionalTypes.includes(STATUS_IRI.gone)) {
    return 'gone';
  }
  if (additionalTypes.includes(STATUS_IRI.invalid)) {
    return 'invalid';
  }
  if (validUntilIso !== undefined) {
    return 'archived';
  }
  return 'valid';
}

const RDF_MEDIA_TYPE_SET: ReadonlySet<string> = new Set(RDF_MEDIA_TYPES);

/** Grouped format facet values (`group:sparql`, `group:rdf`). */
function formatGroups(
  formats: readonly string[],
  conformsTo: readonly string[],
): string[] {
  const groups: string[] = [];
  if (conformsTo.includes(SPARQL_PROTOCOL_URI)) {
    groups.push(FORMAT_GROUP_SPARQL);
  }
  if (formats.some((format) => RDF_MEDIA_TYPE_SET.has(format))) {
    groups.push(FORMAT_GROUP_RDF);
  }
  return groups;
}

function parseNumber(value: string | undefined): number | null {
  if (value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function sumNumbers(values: readonly string[]): number {
  return values.reduce((total, value) => total + (parseNumber(value) ?? 0), 0);
}

function parseBoolean(value: string | undefined): boolean | null {
  if (value === undefined) {
    return null;
  }
  return value === 'true' || value === '1';
}
