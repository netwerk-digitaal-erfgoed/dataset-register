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
  isLinkedDataMet,
  isPersistentUrisMet,
  isSchemaApNdeMet,
  isTermsMet,
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
      type: 'langText',
      locales: ['nl', 'en'],
      display: true,
      search: true,
      sort: true,
    },
    {
      name: 'description',
      path: `${DCT}description`,
      type: 'langText',
      locales: ['nl', 'en'],
      display: true,
      search: true,
    },
    {
      // Search-only: the card resolves the publisher IRI to a label via the
      // `labels` collection, so no per-locale display fields are emitted here.
      name: 'publisher',
      path: `${DR}publisherName`,
      type: 'langText',
      locales: ['nl', 'en'],
      search: true,
    },
    {
      name: 'creator',
      path: `${DR}creatorName`,
      type: 'langText',
      locales: ['nl', 'en'],
      search: true,
    },
    { name: 'keyword', path: `${DCAT}keyword`, type: 'facet', search: true },
    { name: 'publisher', path: `${DR}organization`, type: 'facet', iri: true },
    { name: 'catalog', path: `${DR}catalog`, type: 'facet', iri: true },
    {
      name: 'format',
      path: `${DR}format`,
      type: 'facet',
      transform: normalizeMediaType,
    },
    { name: 'language', path: `${DCT}language`, type: 'facet' },
    { name: 'class', path: `${DR}class`, type: 'facet', iri: true },
    {
      name: 'terminology_source',
      path: `${DR}terminologySource`,
      type: 'facet',
      iri: true,
    },
    { name: 'date_posted', path: `${DR}datePosted`, type: 'date' },
    { name: 'size', path: `${DR}size`, type: 'number' },
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
    // NDE compatibility (“vinkjes”) booleans, derived from the merged DKG DQV
    // measurements via the shared core predicates. Each field is set only when
    // its criterion is met, keeping the document lean (the field is optional, so
    // absent reads as not-met) and a faceted `field:=true` count meaningful.
    (document, node) => {
      // Declared IIIF manifest count = sum of the IIIF `void:subset`
      // `void:entities`; shown on the card when positive.
      const iiifManifestCount = sumNumbers(
        literalsOf(node, `${DR}iiifEntities`),
      );
      if (iiifManifestCount > 0) {
        document.iiif_manifest_count = iiifManifestCount;
      }

      const quadsValidated = parseNumber(
        firstLiteralOf(node, `${DR}quadsValidated`),
      );
      const schemaApNdeConformant = parseBoolean(
        firstLiteralOf(node, `${DR}schemaApNdeConformant`),
      );
      if (
        isSchemaApNdeMet({ quadsValidated, conformant: schemaApNdeConformant })
      ) {
        document.nde_schema_ap = true;
      }

      if (
        isLinkedDataMet({
          // dr:size is void:triples — the strongest DKG content signal.
          triples: (document.size as number | undefined) ?? null,
          quadsValidated,
          conformant: schemaApNdeConformant,
        })
      ) {
        document.linked_data = true;
      }

      if (
        isTermsMet(
          (document.terminology_source as string[] | undefined)?.length ?? 0,
        )
      ) {
        document.terms = true;
      }

      // Durable polarity: the DKG emits the boolean with value `false` only when
      // the namespace is on its non-durable disallow list; an absent measurement
      // (or any non-false value) means the namespace is durable.
      const namespaceFlag = parseBoolean(
        firstLiteralOf(node, `${DR}subjectNamespaceDurable`),
      );
      if (
        isPersistentUrisMet({
          sampled: parseNumber(firstLiteralOf(node, `${DR}subjectUrisSampled`)),
          resolved: parseNumber(
            firstLiteralOf(node, `${DR}subjectUrisResolved`),
          ),
          durable: namespaceFlag !== false,
        })
      ) {
        document.persistent_uris = true;
      }
    },
  ];
}

/** Parse a numeric literal string to a number, or null when absent/unparseable. */
function parseNumber(value: string | undefined): number | null {
  if (value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Sum numeric literal strings (e.g. void:entities across several IIIF subsets). */
function sumNumbers(values: readonly string[]): number {
  return values.reduce((total, value) => total + (parseNumber(value) ?? 0), 0);
}

/** Parse an `xsd:boolean` literal (`true`/`false`/`1`/`0`), or null when absent. */
function parseBoolean(value: string | undefined): boolean | null {
  if (value === undefined) {
    return null;
  }
  return value === 'true' || value === '1';
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
