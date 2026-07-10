import { IANA_MEDIA_TYPE_PREFIX } from '@dataset-register/core/search';

/**
 * SPARQL expression to normalize IANA media type URIs to bare media types.
 * Strips the IANA prefix if present, otherwise returns the value as-is.
 */
export const normalizeMediaType = (inputVar: string, outputVar: string) =>
  `BIND(IF(STRSTARTS(STR(${inputVar}), "${IANA_MEDIA_TYPE_PREFIX}"),
          STRAFTER(STR(${inputVar}), "${IANA_MEDIA_TYPE_PREFIX}"),
          STR(${inputVar})) AS ${outputVar})`;
