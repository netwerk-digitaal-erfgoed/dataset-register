import { fold } from '@lde/text-normalization';
import { REGISTRATION_STATUS_BASE_URI } from '@dataset-register/core';
import type { TypesenseDocument } from '@lde/typesense';
import {
  IANA_MEDIA_TYPE_PREFIX,
  RDF_MEDIA_TYPES,
  SPARQL_PROTOCOL_URI,
} from './constants.js';

/** A literal value with its (possibly empty) language tag. */
export interface LangValue {
  readonly value: string;
  readonly lang: string;
}

/**
 * The raw, multi-valued projection input collected from the register store for
 * one dataset — before folding, grouping and status derivation. Kept as a plain
 * data bag so {@link buildDocument} is a pure function, unit-testable without
 * SPARQL or Typesense.
 */
export interface RawDataset {
  readonly iri: string;
  readonly titles: readonly LangValue[];
  readonly descriptions: readonly LangValue[];
  readonly publisherNames: readonly LangValue[];
  readonly creatorNames: readonly LangValue[];
  readonly keywords: readonly LangValue[];
  readonly languages: readonly string[];
  readonly publisherIris: readonly string[];
  readonly mediaTypes: readonly string[];
  readonly conformsTo: readonly string[];
  /** `schema:additionalType` IRIs on the registration (status markers). */
  readonly additionalTypes: readonly string[];
  readonly dateReadIso?: string;
  readonly datePostedIso?: string;
  readonly validUntilIso?: string;
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

/** Display-language preference: UI locale handled at query time; at index time
 *  we store nl/en explicitly and a single best-effort display name. */
const DISPLAY_FALLBACK_ORDER = ['nl', 'en', ''] as const;

/**
 * Project one dataset’s raw register data into a flat Typesense document per the
 * shared field registry. Searchable fields are folded (identically to the query
 * path) and carry all language values; display fields are per-locale; facet and
 * sort fields are precomputed.
 */
export function buildDocument(raw: RawDataset): TypesenseDocument {
  const status = deriveStatus(raw);
  const formats = normalizeMediaTypes(raw.mediaTypes);
  const document: TypesenseDocument = {
    id: raw.iri,

    // Searchable, folded, all languages per concept.
    title_search: foldAll(raw.titles),
    status,
    status_rank: STATUS_RANK[status],
    title_sort: fold(localized(raw.titles) ?? ''),
  };

  setIfPresent(document, 'description_search', foldAll(raw.descriptions));
  setIfPresent(document, 'publisher_search', foldAll(raw.publisherNames));
  setIfPresent(document, 'creator_search', foldAll(raw.creatorNames));
  setIfArray(
    document,
    'keyword_search',
    dedupe(raw.keywords.map((keyword) => fold(keyword.value))),
  );

  // Per-locale display fields (accents preserved; folding is retrieval-only).
  setIfPresent(document, 'title_nl', byLang(raw.titles, 'nl'));
  setIfPresent(document, 'title_en', byLang(raw.titles, 'en'));
  setIfPresent(document, 'description_nl', byLang(raw.descriptions, 'nl'));
  setIfPresent(document, 'description_en', byLang(raw.descriptions, 'en'));
  setIfPresent(document, 'publisher_name', localized(raw.publisherNames));

  // Facets.
  setIfArray(document, 'publisher', dedupe(raw.publisherIris));
  setIfArray(
    document,
    'keyword',
    dedupe(raw.keywords.map((keyword) => keyword.value)),
  );
  setIfArray(document, 'format', formats);
  setIfArray(document, 'format_group', formatGroups(formats, raw.conformsTo));
  setIfArray(document, 'language', dedupe(raw.languages));

  // Sort keys.
  setIfPresent(document, 'date_posted', unixTime(raw.datePostedIso));

  return document;
}

export function deriveStatus(raw: RawDataset): DatasetStatus {
  if (raw.additionalTypes.includes(STATUS_IRI.gone)) {
    return 'gone';
  }
  if (raw.additionalTypes.includes(STATUS_IRI.invalid)) {
    return 'invalid';
  }
  if (raw.validUntilIso !== undefined) {
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

function normalizeMediaTypes(mediaTypes: readonly string[]): string[] {
  return dedupe(mediaTypes.map(normalizeMediaType));
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

/** Fold and join all language values of a concept into one searchable string. */
function foldAll(values: readonly LangValue[]): string {
  return fold(values.map((value) => value.value).join(' ')).trim();
}

function byLang(
  values: readonly LangValue[],
  lang: string,
): string | undefined {
  return values.find((value) => value.lang === lang)?.value;
}

/** Best display value: UI locale is applied at query time, so pick nl → en →
 *  untagged → first available for the stored display fields. */
function localized(values: readonly LangValue[]): string | undefined {
  for (const lang of DISPLAY_FALLBACK_ORDER) {
    const match = byLang(values, lang);
    if (match !== undefined) {
      return match;
    }
  }
  return values[0]?.value;
}

function unixTime(iso: string | undefined): number | undefined {
  if (iso === undefined) {
    return undefined;
  }
  const millis = new Date(iso).getTime();
  return Number.isNaN(millis) ? undefined : Math.trunc(millis / 1000);
}

function dedupe(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}

function setIfPresent(
  document: TypesenseDocument,
  field: string,
  value: string | number | undefined,
): void {
  if (value !== undefined && value !== '') {
    document[field] = value;
  }
}

function setIfArray(
  document: TypesenseDocument,
  field: string,
  values: readonly string[],
): void {
  if (values.length > 0) {
    document[field] = values;
  }
}
