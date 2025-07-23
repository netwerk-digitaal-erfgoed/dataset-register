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
