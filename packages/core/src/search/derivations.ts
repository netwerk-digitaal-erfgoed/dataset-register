/**
 * Derived search values — fields computed from several predicates rather than
 * projected from one. Kept here (not in the indexer) so the logic is shared and
 * unit-testable, mirroring {@link ./compatibility.ts} and {@link ./class-groups.ts}.
 */

import { REGISTRATION_STATUS_BASE_URI } from '../constants.ts';
import {
  FORMAT_GROUP_RDF,
  FORMAT_GROUP_SPARQL,
  RDF_MEDIA_TYPES,
  SPARQL_PROTOCOL_URI,
} from './media-types.ts';

export type DatasetStatus = 'valid' | 'archived' | 'invalid' | 'gone';

/** Lower rank sorts first when browsing without a text query. */
export const STATUS_RANK: Readonly<Record<DatasetStatus, number>> = {
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

const RDF_MEDIA_TYPE_SET: ReadonlySet<string> = new Set(RDF_MEDIA_TYPES);

/** Grouped format facet values (`group:sparql`, `group:rdf`) shown alongside the
 *  granular media types. */
export function formatGroups(
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

/** Parse a numeric literal string to a number, or null when absent/unparseable. */
export function parseNumber(value: string | undefined): number | null {
  if (value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Sum numeric literal strings (e.g. void:entities across several IIIF subsets). */
export function sumNumbers(values: readonly string[]): number {
  return values.reduce((total, value) => total + (parseNumber(value) ?? 0), 0);
}

/** Parse an `xsd:boolean` literal (`true`/`false`/`1`/`0`), or null when absent. */
export function parseBoolean(value: string | undefined): boolean | null {
  if (value === undefined) {
    return null;
  }
  return value === 'true' || value === '1';
}
