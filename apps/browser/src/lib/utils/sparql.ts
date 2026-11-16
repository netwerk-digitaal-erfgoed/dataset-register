import { IANA_MEDIA_TYPE_PREFIX } from '@dataset-register/core/search';

// Characters disallowed inside a SPARQL IRIREF (`<...>`): per the grammar, any
// codepoint ≤ U+0020 (space, tab, newline, controls) and the set <>"{}|^`\.
// Queries interpolate IRIs straight into `<...>`, so an IRI carrying any of these would produce a syntactically invalid query that
// throws — surfacing as a 500 instead of a clean “not found”. The usual trigger
// is a literal `+` in the IRI shared without percent-encoding: URLSearchParams
// reads `+` as a space (legacy form-encoding), and the original `+` cannot be
// recovered, so 404 is the best achievable outcome.
// eslint-disable-next-line no-control-regex -- matching control codepoints is the point
export const ILLEGAL_IRI_CHARS = /[\x00-\x20<>"{}|^`\\]/;

/**
 * SPARQL expression to normalize IANA media type URIs to bare media types.
 * Strips the IANA prefix if present, otherwise returns the value as-is.
 */
export const normalizeMediaType = (inputVar: string, outputVar: string) =>
  `BIND(IF(STRSTARTS(STR(${inputVar}), "${IANA_MEDIA_TYPE_PREFIX}"),
          STRAFTER(STR(${inputVar}), "${IANA_MEDIA_TYPE_PREFIX}"),
          STR(${inputVar})) AS ${outputVar})`;
