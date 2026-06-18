import {
  irisOf,
  firstLiteralOf,
  literalsOf,
  type Derivation,
  type FieldSpec,
  type Projection,
} from '@lde/search';
import {
  deriveClassGroups,
  REGISTRATION_STATUS_BASE_URI,
} from '@dataset-register/core';
import {
  IANA_MEDIA_TYPE_PREFIX,
  RDF_MEDIA_TYPES,
  SPARQL_PROTOCOL_URI,
} from './constants.js';

const DCT = 'http://purl.org/dc/terms/';
const DCAT = 'http://www.w3.org/ns/dcat#';
const SCHEMA = 'https://schema.org/';
/** Register-internal IR predicates: promoted registration facts + DKG facets. */
const DR = 'urn:dr:';

/**
 * The complete projection for `dcat:Dataset` — the runtime form of one SHACL
 * NodeShape: the root `type` to frame by (`sh:targetClass`), the `fields`
 * (property shapes), and the `derivations` (computed fields). `@lde/search`’s
 * `projectGraph`/`projectDocument` apply the conventions (per-locale split,
 * folding, facet arrays, coercion); only the field-to-predicate mapping lives
 * here. Mirrors `SEARCH_FIELDS` (the output contract used by the collection
 * schema + browser query path); the eventual SHACL pipeline generates this.
 */
export const DATASET_PROJECTION: Projection = {
  type: 'http://www.w3.org/ns/dcat#Dataset',
  fields: datasetFields(),
  derivations: datasetDerivations(),
};

function datasetFields(): readonly FieldSpec[] {
  return [
    {
      name: 'title',
      path: `${DCT}title`,
      kind: {
        type: 'langText',
        locales: ['nl', 'en'],
        display: true,
        search: true,
        sort: true,
      },
    },
    {
      name: 'description',
      path: `${DCT}description`,
      kind: {
        type: 'langText',
        locales: ['nl', 'en'],
        display: true,
        search: true,
      },
    },
    {
      // Search-only: the card resolves the publisher IRI to a label via the
      // `labels` collection, so no per-locale display fields are emitted here.
      name: 'publisher',
      path: `${DR}publisherName`,
      kind: { type: 'langText', locales: ['nl', 'en'], search: true },
    },
    {
      name: 'creator',
      path: `${DR}creatorName`,
      kind: { type: 'langText', locales: ['nl', 'en'], search: true },
    },
    {
      name: 'keyword',
      path: `${DCAT}keyword`,
      kind: { type: 'facet', search: true },
    },
    {
      name: 'publisher',
      path: `${DR}organization`,
      kind: { type: 'facet', iri: true },
    },
    {
      name: 'format',
      path: `${DR}format`,
      kind: { type: 'facet', transform: normalizeMediaType },
    },
    { name: 'language', path: `${DCT}language`, kind: { type: 'facet' } },
    { name: 'class', path: `${DR}class`, kind: { type: 'facet', iri: true } },
    {
      name: 'terminology_source',
      path: `${DR}terminologySource`,
      kind: { type: 'facet', iri: true },
    },
    {
      name: 'date_posted',
      path: `${DR}datePosted`,
      kind: { type: 'number', date: true },
    },
    { name: 'size', path: `${DR}size`, kind: { type: 'number' } },
  ];
}

/** Computed fields that aren’t a direct projection of a single predicate. */
function datasetDerivations(): readonly Derivation[] {
  return [
    // Registration status + its sort rank, from the promoted registration facts.
    (document, node) => {
      const status = deriveStatus(
        irisOf(node, `${SCHEMA}additionalType`),
        firstLiteralOf(node, `${DR}validUntil`),
      );
      document.status = status;
      document.status_rank = STATUS_RANK[status];
    },
    // Grouped format facet (group:sparql / group:rdf) alongside the granular ones.
    (document, node) => {
      const groups = formatGroups(
        (document.format as string[] | undefined) ?? [],
        literalsOf(node, `${DR}conformsTo`),
      );
      if (groups.length > 0) {
        document.format_group = groups;
      }
    },
    // Grouped class facet derived index-time from the granular DKG classes.
    (document) => {
      const groups = deriveClassGroups(
        (document.class as string[] | undefined) ?? [],
      );
      if (groups.length > 0) {
        document.class_group = groups;
      }
    },
  ];
}

export type DatasetStatus = 'valid' | 'archived' | 'invalid' | 'gone';

/** Lower rank sorts first when browsing without a text query. */
const STATUS_RANK: Readonly<Record<DatasetStatus, number>> = {
  valid: 0,
  archived: 1,
  invalid: 2,
  gone: 3,
};

const STATUS_IRI: Readonly<Record<Exclude<DatasetStatus, 'archived'>, string>> =
  {
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

/** Strip the IANA media-types prefix to the bare `type/subtype`, mirroring the
 *  browser’s facet normalization. */
export function normalizeMediaType(mediaType: string): string {
  return mediaType.startsWith(IANA_MEDIA_TYPE_PREFIX)
    ? mediaType.slice(IANA_MEDIA_TYPE_PREFIX.length)
    : mediaType;
}

const RDF_MEDIA_TYPE_SET: ReadonlySet<string> = new Set(RDF_MEDIA_TYPES);

/** Grouped format facet values (`group:sparql`, `group:rdf`) the UI shows
 *  alongside the granular media types. */
function formatGroups(
  formats: readonly string[],
  conformsTo: readonly string[],
): string[] {
  const groups: string[] = [];
  if (conformsTo.includes(SPARQL_PROTOCOL_URI)) {
    groups.push('group:sparql');
  }
  if (formats.some((format) => RDF_MEDIA_TYPE_SET.has(format))) {
    groups.push('group:rdf');
  }
  return groups;
}
