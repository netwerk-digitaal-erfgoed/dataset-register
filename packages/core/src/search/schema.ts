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
  type FramedNode,
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
// SEARCH_LOCALES has a single home in collections.ts (a node-free module the
// browser query path reads too); the schema imports it so the two sides cannot
// declare a different locale set.
import { SEARCH_LOCALES } from './collections.ts';

/** schema.org and the register-internal IR predicate prefixes. */
const SCHEMA = 'https://schema.org/';
const DR = 'urn:dr:';

/**
 * The schema-AP and Linked-Data booleans both read `quadsValidated` and
 * `schemaApNdeConformant` off the same node. Memoize the pair per node so the
 * projection looks each predicate up once per dataset instead of twice.
 */
const qualityByNode = new WeakMap<
  FramedNode,
  {
    readonly quadsValidated: number | null;
    readonly conformant: boolean | null;
  }
>();
function qualityMeasurements(node: FramedNode): {
  readonly quadsValidated: number | null;
  readonly conformant: boolean | null;
} {
  let quality = qualityByNode.get(node);
  if (quality === undefined) {
    quality = {
      quadsValidated: parseNumber(firstLiteralOf(node, `${DR}quadsValidated`)),
      conformant: parseBoolean(
        firstLiteralOf(node, `${DR}schemaApNdeConformant`),
      ),
    };
    qualityByNode.set(node, quality);
  }
  return quality;
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
      path: 'urn:dr:catalog',
      array: true,
      filterable: true,
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
      derive: (node) => {
        const classes = [...new Set(irisOf(node, `${DR}class`))];
        const groups = deriveClassGroups(classes);
        const combined = [...classes, ...groups];
        return combined.length > 0 ? combined : undefined;
      },
    },
    {
      name: 'terminology_source',
      kind: 'reference',
      path: 'urn:dr:terminologySource',
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
      path: 'http://purl.org/dc/terms/language',
      array: true,
      facetable: true,
      output: true,
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
      derive: (node) => {
        const mediaTypes = [
          ...new Set(literalsOf(node, `${DR}format`).map(stripIanaPrefix)),
        ];
        const groups = formatGroups(
          mediaTypes,
          literalsOf(node, `${DR}conformsTo`),
        );
        const combined = [...mediaTypes, ...groups];
        return combined.length > 0 ? combined : undefined;
      },
    },
    {
      name: 'date_posted',
      kind: 'date',
      path: 'urn:dr:datePosted',
      sortable: true,
      output: true,
    },
    {
      name: 'size',
      kind: 'integer',
      path: 'urn:dr:size',
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
      name: 'status',
      kind: 'keyword',
      facetable: true,
      filterable: true,
      required: true,
      output: true,
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
      // Declared IIIF manifest count (sum of the IIIF subsets’ void:entities);
      // shown on the card when positive. Not a facet.
      name: 'iiif_manifest_count',
      kind: 'integer',
      output: true,
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
      output: true,
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
      output: true,
      derive: (node) =>
        isSchemaApNdeMet(qualityMeasurements(node)) ? true : undefined,
    },
    {
      name: 'linked_data',
      kind: 'boolean',
      facetable: true,
      derive: (node, document) =>
        isLinkedDataMet({
          triples: (document.size as number | undefined) ?? null,
          ...qualityMeasurements(node),
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
            parseBoolean(
              firstLiteralOf(node, `${DR}subjectNamespaceDurable`),
            ) !== false,
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
  class: CLASS_TYPE,
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
  class: TERMINOLOGY_SOURCE_TYPE,
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
