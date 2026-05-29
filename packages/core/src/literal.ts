const dateTimeRegex = '^\\\\d{4}-\\\\d{2}-\\\\d{2}T';

/**
 * Convert a date value to xsd:date or xsd:dateTime, depending on its pattern.
 *
 * This is needed because:
 *
 * 1. in the query result, values for a predicate with range schema:Date/schema:DateTime always have schema:Date if no
 *    type is specified in the data;
 * 2. some datasets have values such as "2024-01-01T01:09:00+01:00"^^<https://schema.org/Date>, which we want to correct
 *    to xsd:dateTime.
 */
export const convertToXsdDate = (variable: string) =>
  `?${variable}Raw ;
        BIND(STRDT(STR(?${variable}Raw), IF(REGEX(STR(?${variable}Raw), "${dateTimeRegex}"), xsd:dateTime, xsd:date)) AS ?${variable})`;

export const convertToIri = (variable: string) =>
  `?${variable}Raw ;
        BIND(IRI(?${variable}Raw) AS ?${variable})`;

/**
 * Normalize a license value. If the raw value is an IRI, strip the "deed.nl"
 * suffix and upgrade http://creativecommons.org to https://. If the raw value
 * is a literal, pass it through unchanged so that a non-IRI license (allowed
 * by SHACL with sh:nodeKind sh:IRIOrLiteral) does not crash the CONSTRUCT
 * with an invalid-IRI error.
 *
 * https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1141
 */
export const normalizeLicense = (variable: string) =>
  `?${variable}Raw ;
        BIND(
          IF(
            isIRI(?${variable}Raw),
            IRI(
              REPLACE(REPLACE(STR(?${variable}Raw), "deed.nl", ""), "http://creativecommons.org", "https://creativecommons.org")
            ),
            ?${variable}Raw
          )
          AS ?${variable}
        )`;

/**
 * Bind ?out to the normalized IRI form of ?in if ?in is an IRI, or a literal
 * whose lexical form is a URL; otherwise leave ?out unbound (via the ?unbound
 * trick). Used for dataset-level license reads where we want to ignore literal
 * placeholders rather than emit them.
 *
 * Some publishers (e.g. the Atlantis export behind Literatuurmuseum) emit
 * schema:license as a plain literal holding a URL rather than as an IRI
 * resource. SHACL accepts those (sh:nodeKind sh:IRIOrLiteral), so we coerce a
 * URL-shaped literal to an IRI here to keep the indexed dct:license populated.
 * https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1997
 *
 * IRI() is only invoked inside the IF true-branch — a bare FILTER(isIRI(...))
 * does not prevent Comunica from eagerly evaluating IRI() on a literal. The
 * "^https?://" anchor keeps the true-branch limited to values that are already
 * valid URLs, so a placeholder like "zie distributies" (or prose merely
 * containing a URL) stays unbound and does not crash the CONSTRUCT.
 */
export const bindIriLicense = (rawVar: string, outVar: string) =>
  `BIND(
        IF(
          isIRI(?${rawVar}) || REGEX(STR(?${rawVar}), "^https?://"),
          IRI(REPLACE(REPLACE(STR(?${rawVar}), "deed.nl", ""), "http://creativecommons.org", "https://creativecommons.org")),
          ?unbound
        ) AS ?${outVar}
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
 * - Strips +gzip or +zip suffix (e.g., "application/n-triples+gzip" becomes
 *   "application/n-triples"); the compression format is captured separately by
 *   compressFormatFromMediaType()
 */
export const normalizeMediaType = (variable: string) =>
  `?${variable}Raw ;
        BIND(
          IF(
            isIRI(?${variable}Raw),
            IRI(REPLACE(REPLACE(STR(?${variable}Raw), "\\\\+g?zip$", ""), "^http://", "https://")),
            IRI(
              CONCAT(
                "https://www.iana.org/assignments/media-types/",
                REPLACE(REPLACE(STR(?${variable}Raw), ";.*$", ""), "\\\\+g?zip$", "")
              )
            )
          )
          AS ?${variable}
        )`;

/**
 * Detect +gzip or +zip in the raw media type and bind a compress format URI.
 *
 * Returns a SPARQL BIND that sets the compress format variable to
 * <https://www.iana.org/assignments/media-types/application/gzip> for +gzip,
 * <https://www.iana.org/assignments/media-types/application/zip> for +zip,
 * or leaves it unbound otherwise.
 */
export const compressFormatFromMediaType = (
  mediaTypeVariable: string,
  compressFormatVariable: string,
) =>
  `BIND(
    IF(
      REGEX(STR(?${mediaTypeVariable}Raw), "\\\\+gzip$"),
      <https://www.iana.org/assignments/media-types/application/gzip>,
      IF(
        REGEX(STR(?${mediaTypeVariable}Raw), "\\\\+zip$"),
        <https://www.iana.org/assignments/media-types/application/zip>,
        ?unbound
      )
    ) AS ?${compressFormatVariable}
  )`;

