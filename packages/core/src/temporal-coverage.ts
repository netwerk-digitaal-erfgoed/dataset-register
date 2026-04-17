/**
 * Parse a `schema:temporalCoverage` (or `dct:temporal`) literal into a
 * DCAT-style `dct:PeriodOfTime` shape (`dcat:startDate` / `dcat:endDate`).
 *
 * Accepts:
 * - ISO 8601 points: `"2011"`, `"2011-05"`, `"2011-05-01"`, `"2011-05-01T12:00:00"`
 * - BCE points with ISO 8601 leading-minus notation: `"-0500"`, `"-0753-04"`
 * - ISO 8601 intervals: `"2011/2012"`, `"-0753/0476"`, `"2011-05-01/2012-06"`
 * - Shortened intervals (end inherits start's prefix): `"1889-06/07"` → `"1889-06"` / `"1889-07"`
 * - Open-ended intervals: `"2015-11/.."`, `"../2020"`
 * - Range notations with en/em dash or hyphen between two CE years: `"1811–1930"`, `"1811—1930"`, `"1811-1930"`
 *
 * Returns `null` for unparseable input (e.g. `"circa 1900"`). BCE ranges must
 * use the explicit `/` form (e.g. `"-0500/-0400"`); the hyphen-as-range rule
 * only fires for two bare CE years.
 */
export function parseTemporalCoverage(
  literal: string,
): { start?: string; end?: string } | null {
  const normalized = literal
    .trim()
    .replace(approximationPrefix, '')
    .replace(enOrEmDash, '/')
    .replace(spacedHyphen, '/')
    .replace(bareYearRange, '$1/$2');
  if (normalized === '') return null;

  if (!normalized.includes('/')) {
    // Single ISO 8601 point (e.g. "2011", "2011-05", "2011-05-01") represents
    // the full unit it names — emit identical start and end.
    return isoPointPattern.test(normalized)
      ? { start: normalized, end: normalized }
      : null;
  }

  const [rawStart, rawEnd] = normalized.split('/', 2);
  const start = isOpenEndMarker(rawStart) ? '' : rawStart.trim();
  const end = isOpenEndMarker(rawEnd)
    ? ''
    : expandShortenedEnd(start, rawEnd.trim());

  if (start !== '' && !isoPointPattern.test(start)) return null;
  if (end !== '' && !isoPointPattern.test(end)) return null;
  if (start === '' && end === '') return null;

  return {
    ...(start !== '' && { start }),
    ...(end !== '' && { end }),
  };
}

const approximationPrefix = /^(?:ca\.|circa)\s+/i;
const enOrEmDash = /\s*[\u2013\u2014]\s*/g;
const spacedHyphen = /\s+-\s+/g;
// Collapse "YYYY-YYYY" to "YYYY/YYYY" only when that is the *entire* string —
// ISO 8601 dates like "2011-05" or "2011-05-01" must not be touched.
const bareYearRange = /^(\d{4})-(\d{4})$/;
const isoPointPattern = /^-?\d{4}(-\d{2}(-\d{2}(T\d{2}:\d{2}(:\d{2})?)?)?)?$/;

const openEndMarkers = new Set(['..', 'heden', 'nu', 'present', 'now']);

function isOpenEndMarker(value: string): boolean {
  return openEndMarkers.has(value.trim().toLowerCase());
}

// Expand ISO 8601 shortened interval notation: when the end value is shorter
// than the start and lacks the start's separators, it inherits the start's
// prefix — e.g. start=`1889-06`, end=`07` → end=`1889-07`. The leading minus
// on BCE years is not a structural separator and must not trigger expansion.
function expandShortenedEnd(start: string, end: string): string {
  if (start === '' || end === '' || end.length >= start.length) return end;
  if (end.includes('-') || end.includes('T')) return end;
  const startBody = start.startsWith('-') ? start.slice(1) : start;
  if (!startBody.includes('-')) return end;
  return start.slice(0, start.length - end.length) + end;
}
