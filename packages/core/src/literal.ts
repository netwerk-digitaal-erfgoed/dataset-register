const dateTimeRegex = '^\\\\d{4}-\\\\d{2}-\\\\d{2}T';

/**
 * Convert a date value to xsd:date or xsd:dateTime, depending on its pattern.
 *
 * This is needed because:
 *
 * 1. in the query result, values for a predicate with range schema:Date/schema:DateTime always have schema:Date if no
 *    type is specified in the data;
 * 2. some datasets have values such as "2024-01-01T01:09:00+01:00"^^<http://schema.org/Date>, which we want to correct
 *    to xsd:dateTime.
 */
export const convertToXsdDate = (variable: string) =>
  `?${variable}Raw ;
        BIND(STRDT(STR(?${variable}Raw), IF(REGEX(STR(?${variable}Raw), "${dateTimeRegex}"), xsd:dateTime, xsd:date)) AS ?${variable})`;

export const convertToIri = (variable: string) =>
  `?${variable}Raw ;
        BIND(IRI(?${variable}Raw) AS ?${variable})`;

/**
 * https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1141
 */
export const normalizeLicense = (variable: string) =>
  `?${variable}Raw ;
        BIND(
          IRI(
            REPLACE(REPLACE(STR(?${variable}Raw), "deed.nl", ""), "http://creativecommons.org", "https://creativecommons.org")
          )
          AS ?${variable}
        )`;

/**
 * Normalize mediaType to IANA URI format.
 *
 * DCAT-3 requires dcat:mediaType to be URIs pointing to the IANA media type registry.
 * This function converts:
 * - Text literals like "application/ld+json" to https://www.iana.org/assignments/media-types/application/ld+json
 * - Already-formed IANA URIs pass through unchanged
 * - Normalizes http:// to https:// for consistency
 * - Strips parameters (e.g., "text/html; charset=utf-8" becomes "text/html")
 */
export const normalizeMediaType = (variable: string) =>
  `?${variable}Raw ;
        BIND(
          IF(
            isIRI(?${variable}Raw),
            IRI(REPLACE(STR(?${variable}Raw), "^http://", "https://")),
            IRI(
              CONCAT(
                "https://www.iana.org/assignments/media-types/",
                REPLACE(STR(?${variable}Raw), ";.*$", "")
              )
            )
          )
          AS ?${variable}
        )`;

/**
 * Normalize byte size to xsd:integer.
 *
 * Some datasets provide human-readable values like "87 MB" instead of raw bytes.
 * This converts common formats (B, KB, MB, GB, TB) to integer bytes.
 */
export const normalizeByteSize = (variable: string) =>
  `?${variable}Raw ;
        BIND(
          IF(
            REGEX(STR(?${variable}Raw), "^[0-9.]+\\\\s*(B|KB|MB|GB|TB)$", "i"),
            xsd:integer(FLOOR(
              xsd:decimal(REPLACE(STR(?${variable}Raw), "^([0-9.]+).*", "$1")) *
              IF(REGEX(STR(?${variable}Raw), "TB", "i"), 1099511627776,
              IF(REGEX(STR(?${variable}Raw), "GB", "i"), 1073741824,
              IF(REGEX(STR(?${variable}Raw), "MB", "i"), 1048576,
              IF(REGEX(STR(?${variable}Raw), "KB", "i"), 1024,
              1))))
            )),
            IF(
              REGEX(STR(?${variable}Raw), "^[0-9]+$"),
              xsd:integer(?${variable}Raw),
              ?${variable}Raw
            )
          )
          AS ?${variable}
        )`;

/**
 * Convert URI keywords to string literals while preserving language-tagged literals.
 *
 * Some datasets use URIs as keywords (e.g., SKOS Concepts) while others use
 * language-tagged literals. This normalizes URIs to string literals so they
 * can be processed uniformly, while preserving language tags on literals.
 */
export const convertUriToLiteral = (variable: string) =>
  `?${variable}Raw ;
        BIND(IF(isIRI(?${variable}Raw), STR(?${variable}Raw), ?${variable}Raw) AS ?${variable})`;

/**
 * Default to a language tag if the literal has none, preserving existing tags.
 */
export const defaultLanguageTag = (variable: string, lang = 'nl') =>
  `?${variable}Raw ;
        BIND(IF(LANG(?${variable}Raw) = "", STRLANG(STR(?${variable}Raw), "${lang}"), ?${variable}Raw) AS ?${variable})`;
