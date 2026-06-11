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

// Base IRI for the distribution-probe outcome vocabulary (nde-probe:). The probe
// records one of these IRIs as a distribution's last outcome; the NamedNode
// forms in distribution-probe/outcomes.ts derive from this same base.
export const PROBE_OUTCOME_BASE_URI = 'https://def.nde.nl/probe#';

// The probe outcomes that mean a distribution is currently unreachable, as
// distinct from a content-type failure (see CONTENT_TYPE_FAILURE_OUTCOMES). Keep
// in sync with classify() in distribution-probe.
export const REACHABILITY_FAILURE_OUTCOMES: readonly string[] = [
  'NetworkError',
  'NotFound',
  'ServerError',
  'AuthRequired',
  'RateLimited',
  'EmptyBody',
  'SparqlProbeFailed',
  'RdfParseFailed',
].map((name) => `${PROBE_OUTCOME_BASE_URI}${name}`);

// The probe outcomes that mean a distribution serves the wrong format: it
// answered with a Content-Type that does not match the declared media type
// (ContentTypeMismatch) or did not declare one at all (ContentTypeMissing). A
// client that asked for the declared format cannot use such a distribution, so
// the browser treats these the same as unreachable.
export const CONTENT_TYPE_FAILURE_OUTCOMES: readonly string[] = [
  'ContentTypeMismatch',
  'ContentTypeMissing',
].map((name) => `${PROBE_OUTCOME_BASE_URI}${name}`);

// Every probe outcome that, once persistent, makes a distribution unavailable to
// a client: it is either unreachable or serves a format other than the one it
// declares. The Dataset Register Browser reads this list to classify
// distribution availability, so the register stays the single source of truth
// for the vocabulary.
export const UNAVAILABILITY_OUTCOMES: readonly string[] = [
  ...REACHABILITY_FAILURE_OUTCOMES,
  ...CONTENT_TYPE_FAILURE_OUTCOMES,
];
