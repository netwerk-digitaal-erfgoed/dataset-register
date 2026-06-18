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
  'SparqlProbeFailed',
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

// Deterministic failures: outcomes whose verdict cannot change by waiting. A
// Content-Type that does not match the declared media type, or none declared at
// all, is the same defect on the next crawl as it is today, so both the crawler
// grace window and the browser badge surface these within one probe cycle
// instead of holding them back for the transient failure-streak window. The
// remaining unavailability outcomes – NetworkError, NotFound, ServerError,
// AuthRequired, RateLimited, SparqlProbeFailed – are transient reachability
// failures that can self-heal between crawls, so they keep riding out the grace
// window. (Empty bodies and unparseable graphs are no longer reachability
// outcomes at all: they migrated to the validity rail – see PRD #2103.)
export const DETERMINISTIC_FAILURE_OUTCOMES: readonly string[] = [
  'ContentTypeMismatch',
  'ContentTypeMissing',
].map((name) => `${PROBE_OUTCOME_BASE_URI}${name}`);

const DETERMINISTIC_FAILURE_OUTCOME_SET: ReadonlySet<string> = new Set(
  DETERMINISTIC_FAILURE_OUTCOMES,
);

// Whether a probe outcome IRI denotes a deterministic content defect, i.e. one
// whose verdict cannot change by waiting. Both the crawler’s failure-streak
// grace window and the browser availability badge call this to surface such
// defects immediately, keeping the two consistent from a single classification.
export function isDeterministicFailure(outcome: string | null): boolean {
  return outcome !== null && DETERMINISTIC_FAILURE_OUTCOME_SET.has(outcome);
}
