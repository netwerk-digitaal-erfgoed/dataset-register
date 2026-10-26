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
 * SPARQL expression that yields ?variable as an IRI when it is one, or a
 * literal holding an absolute IRI, and raises an error otherwise. Wrap it in
 * COALESCE or BIND so the error leaves the target unbound: a bare IRI() on a
 * relative literal such as "data.ttl" aborts the whole CONSTRUCT.
 */
export const absoluteIri = (variable: string) =>
  `IF(isIRI(?${variable}) || REGEX(STR(?${variable}), "^[a-zA-Z][a-zA-Z0-9+.-]*:"), IRI(?${variable}), ?unbound)`;

/**
 * Normalize a license value. If the raw value is an IRI, bring it to its
 * canonical form (see canonicalLicense). If the raw value is a literal, pass
 * it through unchanged so that a non-IRI license (allowed by SHACL with
 * sh:nodeKind sh:IRIOrLiteral) does not crash the CONSTRUCT with an
 * invalid-IRI error.
 *
 * https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1141
 * https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/2303
 */
export const normalizeLicense = (variable: string) =>
  `?${variable}Raw ;
        BIND(
          IF(
            isIRI(?${variable}Raw),
            IRI(${canonicalLicense(variable + 'Raw')}),
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
 * IRI() is only invoked inside the IF true-branch – a bare FILTER(isIRI(...))
 * does not prevent Comunica from eagerly evaluating IRI() on a literal. The
 * "^https?://" anchor keeps the true-branch limited to values that are already
 * valid URLs, so a placeholder like "zie distributies" (or prose merely
 * containing a URL) stays unbound and does not crash the CONSTRUCT.
 */
export const bindIriLicense = (rawVar: string, outVar: string) =>
  `BIND(
        IF(
          isIRI(?${rawVar}) || REGEX(STR(?${rawVar}), "^https?://"),
          IRI(${canonicalLicense(rawVar)}),
          ?unbound
        ) AS ?${outVar}
      )`;

/**
 * The canonical lexical form of license ?variable:
 *
 * 1. Creative Commons IRIs without a trailing deed segment, such as `/deed.nl`,
 *    `/deed.pt_BR` or a bare `/deed`;
 * 2. Creative Commons and RightsStatements.org IRIs on http://, the form both
 *    publish in their RDF (publishers may use either scheme);
 * 3. exactly one trailing slash after the version segment of those IRIs, so
 *    …/zero/1.0 and …/by/4.0// match the canonical …/zero/1.0/ and …/by/4.0/.
 *
 * Other IRIs, and these hosts’ IRIs with a query, fragment or further path
 * (such as `legalcode`), keep their path as is.
 *
 * https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/2303
 */
const canonicalLicense = (variable: string) => {
  const withoutDeed = `REPLACE(STR(?${variable}), "^(https?://creativecommons\\\\.org/.*/)deed(\\\\.[a-zA-Z_-]+)?/?$", "$1")`;
  const onHttp = `REPLACE(${withoutDeed}, "^https://(creativecommons|rightsstatements)\\\\.org/", "http://$1.org/")`;
  return `REPLACE(${onHttp}, "^(http://(creativecommons|rightsstatements)\\\\.org/[^?#]*/[0-9]+\\\\.[0-9]+)/*$", "$1/")`;
};

/**
 * A media type in `type/subtype` form. Mirrors the sh:pattern that shacl.ttl
 * applies to schema:encodingFormat, so the query accepts exactly what the shapes
 * describe as a media type.
 */
const mediaTypePattern = '^[a-zA-Z]+/[a-zA-Z0-9][a-zA-Z0-9!#$&\\\\-^_.+]*$';

/**
 * Normalize mediaType to IANA URI format.
 *
 * DCAT gives dcat:mediaType the range dcterms:MediaType and says the value SHOULD
 * come from the IANA media types registry. DCAT-AP-NL narrows that to IANA only.
 * We stay lenient about what publishers send but store the IANA URI form.
 *
 * This function converts:
 * - Text literals like "application/ld+json" to https://www.iana.org/assignments/media-types/application/ld+json
 * - Already-formed IANA URIs pass through unchanged
 * - Normalizes http:// to https:// for consistency
 * - Strips parameters (e.g., "text/html; charset=utf-8" becomes "text/html")
 * - Strips +gzip or +zip suffix (e.g., "application/n-triples+gzip" becomes
 *   "application/n-triples"); the compression format is captured separately by
 *   compressFormat()
 *
 * A literal that is not a media type at all (e.g. "text turtle", "gzip") is left
 * unbound rather than concatenated onto the IANA prefix. Minting an IRI from it
 * produces either a space-bearing IRI, which serializes to N-Triples the store
 * rejects – losing the whole registration over one bad value – or a well-formed
 * URI into the IANA registry that denotes nothing. Dropping the one property is
 * lenient enough to keep the dataset and strict enough to keep the store valid;
 * the shapes are where a publisher gets told about it.
 *
 * Also used to normalize dcat:compressFormat itself, whose values are media types
 * too (e.g. "application/gzip"). The +g?zip suffix strip is a no-op on those: it
 * only matches a "+"-separated suffix, which a bare compression media type lacks.
 */
export const normalizeMediaType = (variable: string) =>
  `?${variable}Raw ;
        ${bindNormalizedMediaType(variable)}`;

/**
 * SPARQL expression that is true when ?variable is a value normalizeMediaType()
 * turns into a media type: any IRI, or a literal shaped like a media type.
 */
export const isMediaType = (variable: string) =>
  `(isIRI(?${variable}) || REGEX(${withoutParametersAndCompression(variable)}, "${mediaTypePattern}"))`;

/**
 * SPARQL expression that is true when ?variable, a dct:format value, is a media
 * type: an IANA media type IRI, or a literal shaped like a media type. Other
 * IRIs, such as EU file types, are formats but not media types.
 */
export const isIanaMediaType = (variable: string) =>
  `((isIRI(?${variable}) && REGEX(STR(?${variable}), "${ianaMediaTypeIri}")) || (isLiteral(?${variable}) && REGEX(${withoutParametersAndCompression(variable)}, "${mediaTypePattern}")))`;

const ianaMediaTypeIri =
  '^https?://www\\\\.iana\\\\.org/assignments/media-types/';

const withoutParametersAndCompression = (variable: string) =>
  `REPLACE(REPLACE(STR(?${variable}), ";.*$", ""), "\\\\+g?zip$", "")`;

/**
 * The BIND half of normalizeMediaType(), for a ?variableRaw that a pattern other
 * than a single triple binds.
 */
export const bindNormalizedMediaType = (variable: string) => {
  const cleaned = withoutParametersAndCompression(`${variable}Raw`);
  return `BIND(
          IF(
            isIRI(?${variable}Raw),
            IRI(REPLACE(REPLACE(STR(?${variable}Raw), "\\\\+g?zip$", ""), "^http://", "https://")),
            IF(
              REGEX(${cleaned}, "${mediaTypePattern}"),
              IRI(
                CONCAT(
                  "https://www.iana.org/assignments/media-types/",
                  ${cleaned}
                )
              ),
              ?unbound
            )
          )
          AS ?${variable}
        )`;
};

/**
 * Bind the distribution’s compression format URI.
 *
 * A publisher can express compression in two ways, and we accept both:
 *
 * 1. dcat:compressFormat, DCAT’s own property for it. Pass its (already
 *    normalized) variable as declaredVariable; it takes precedence.
 * 2. A +gzip or +zip suffix on the media type, e.g. "application/n-triples+gzip".
 *    normalizeMediaType() strips that suffix, so we recover it from the raw value
 *    here.
 *
 * Binds <https://www.iana.org/assignments/media-types/application/gzip> for +gzip,
 * <https://www.iana.org/assignments/media-types/application/zip> for +zip, and is
 * left unbound when neither source says anything – an unbound variable makes the
 * surrounding COALESCE/IF raise an error, which leaves the BIND target unbound.
 *
 * https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/2251
 */
export const compressFormat = (
  mediaTypeVariable: string,
  compressFormatVariable: string,
  declaredVariable?: string,
) => {
  const fromMediaTypeSuffix = `IF(
      REGEX(STR(?${mediaTypeVariable}Raw), "\\\\+gzip$"),
      <https://www.iana.org/assignments/media-types/application/gzip>,
      IF(
        REGEX(STR(?${mediaTypeVariable}Raw), "\\\\+zip$"),
        <https://www.iana.org/assignments/media-types/application/zip>,
        ?unbound
      )
    )`;

  return `BIND(
    ${
      declaredVariable === undefined
        ? fromMediaTypeSuffix
        : `COALESCE(?${declaredVariable}, ${fromMediaTypeSuffix})`
    } AS ?${compressFormatVariable}
  )`;
};
