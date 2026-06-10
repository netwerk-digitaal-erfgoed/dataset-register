export const REGISTRATION_STATUS_BASE_URI =
  'https://data.netwerkdigitaalerfgoed.nl/registry/';

// schema:additionalType IRI that marks a dataset's schema:Rating as the
// validation-warnings rating (warning count) rather than the completeness
// rating. Lets the two ratings, both linked by schema:contentRating, be told
// apart. The completeness rating carries no additionalType.
export const VALIDATION_WARNINGS_RATING_TYPE = `${REGISTRATION_STATUS_BASE_URI}validation-warnings`;

// Predicate on a registration recording how many sh:Warning-severity results
// its description produced at the last crawl. Lives in the NDE namespace since
// it is a register-specific annotation, not a schema.org or DCAT term.
export const REGISTRATION_WARNING_COUNT_PREDICATE =
  'https://def.nde.nl/registration#warningCount';

export const ALLOWED_DOMAIN_NAME_PREDICATE =
  'https://data.netwerkdigitaalerfgoed.nl/allowed_domain_names/def/domain_name';

export const COULD_NOT_FETCH_URL_PREFIX = 'Could not fetch URL';
