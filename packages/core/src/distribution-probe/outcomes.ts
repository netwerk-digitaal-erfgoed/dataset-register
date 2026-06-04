import factory from 'rdf-ext';
import type { NamedNode } from '@rdfjs/types';
import {
  NetworkError,
  SparqlProbeResult,
  DataDumpProbeResult,
  type ProbeResultType,
} from '@lde/distribution-probe';

export const ndeProbe = (property: string): NamedNode =>
  factory.namedNode(`https://def.nde.nl/probe#${property}`);

export const probeOutcomes = {
  NetworkError: ndeProbe('NetworkError'),
  NotFound: ndeProbe('NotFound'),
  ServerError: ndeProbe('ServerError'),
  AuthRequired: ndeProbe('AuthRequired'),
  RateLimited: ndeProbe('RateLimited'),
  ContentTypeMismatch: ndeProbe('ContentTypeMismatch'),
  ContentTypeMissing: ndeProbe('ContentTypeMissing'),
  EmptyBody: ndeProbe('EmptyBody'),
  SparqlProbeFailed: ndeProbe('SparqlProbeFailed'),
  RdfParseFailed: ndeProbe('RdfParseFailed'),
} as const;

export type ProbeOutcomeIri =
  (typeof probeOutcomes)[keyof typeof probeOutcomes];

export interface ProbeVerdict {
  success: boolean;
  outcome: ProbeOutcomeIri | null;
  detail: string | null;
  /**
   * True when a distribution declared as a SPARQL endpoint answered with an HTML page – the
   * tell-tale sign that the access URL points at a SPARQL query web UI rather than the
   * protocol endpoint. The emission layer turns this into a profile-specific remedy (move the
   * UI to schema:documentation / foaf:page), which it can only do there because it knows the
   * focus node’s path while this classifier, shared across a probe group, does not.
   */
  sparqlWebPage?: boolean;
}

/**
 * Classify a {@link ProbeResultType} into a success verdict plus, on failure, an
 * nde-probe:ProbeOutcome IRI and a human-readable detail string. Content-type mismatches
 * on an otherwise successful probe surface as a failed verdict with a ContentTypeMismatch
 * outcome so the registration path can reject and the rating can penalise.
 */
export function classify(result: ProbeResultType): ProbeVerdict {
  if (result instanceof NetworkError) {
    return {
      success: false,
      outcome: probeOutcomes.NetworkError,
      detail: result.message,
    };
  }

  if (!result.isSuccess()) {
    return classifyHttpFailure(result);
  }

  const mismatch = contentTypeMismatchWarning(result.warnings);
  if (mismatch !== null) {
    return {
      success: false,
      outcome: probeOutcomes.ContentTypeMismatch,
      detail: mismatch,
    };
  }

  return { success: true, outcome: null, detail: null };
}

function classifyHttpFailure(
  result: SparqlProbeResult | DataDumpProbeResult,
): ProbeVerdict {
  if (result.failureReason !== null) {
    const outcome =
      result instanceof SparqlProbeResult
        ? probeOutcomes.SparqlProbeFailed
        : probeResultToRdfOrEmptyOutcome(result);
    return {
      success: false,
      outcome,
      detail: result.failureReason,
    };
  }

  const status = result.statusCode;
  const detail = `HTTP ${status} ${result.statusText}`.trim();

  if (status === 404 || status === 410) {
    return { success: false, outcome: probeOutcomes.NotFound, detail };
  }
  if (status === 401 || status === 403) {
    return { success: false, outcome: probeOutcomes.AuthRequired, detail };
  }
  if (status === 429) {
    return { success: false, outcome: probeOutcomes.RateLimited, detail };
  }
  if (status >= 500) {
    return { success: false, outcome: probeOutcomes.ServerError, detail };
  }
  if (result.contentType === null) {
    return {
      success: false,
      outcome: probeOutcomes.ContentTypeMissing,
      detail,
    };
  }
  if (result instanceof SparqlProbeResult) {
    const mediaType = result.contentType.split(';')[0].trim();
    return {
      success: false,
      outcome: probeOutcomes.ContentTypeMismatch,
      detail: sparqlContentTypeMismatchDetail(mediaType),
      sparqlWebPage: mediaType.toLowerCase() === 'text/html',
    };
  }
  return {
    success: false,
    outcome: probeOutcomes.ContentTypeMismatch,
    detail,
  };
}

/**
 * Message for a SPARQL endpoint that answered with a non-SPARQL content type. The Dataset
 * Register Web UI renders this string verbatim (it becomes the sh:resultMessage), so it names
 * what actually arrived instead of the bare “HTTP 200 OK”. It deliberately does not name an
 * expected media type: a SPARQL endpoint may legitimately return any of several results
 * serializations (e.g. SPARQL-results JSON/XML/CSV for SELECT, RDF for CONSTRUCT), so the
 * message states only that the response is not a results document. When the endpoint served
 * an HTML page it adds the most common cause: the access URL points at a SPARQL query editor
 * or landing page rather than the SPARQL protocol endpoint itself — a frequent mistake when
 * publishers copy the URL from their browser’s address bar. The profile-specific remedy
 * (declare the UI on schema:documentation / foaf:page) is appended later, by emitViolation.
 */
function sparqlContentTypeMismatchDetail(mediaType: string): string {
  const base = `SPARQL endpoint returned ${mediaType}, which is not a SPARQL query results media type.`;
  if (mediaType.toLowerCase() === 'text/html') {
    return `${base} The URL likely points to a web page, such as a SPARQL query editor, rather than the SPARQL protocol endpoint.`;
  }
  return base;
}

function probeResultToRdfOrEmptyOutcome(
  result: DataDumpProbeResult,
): ProbeOutcomeIri {
  const reason = result.failureReason ?? '';
  if (/empty/i.test(reason)) return probeOutcomes.EmptyBody;
  return probeOutcomes.RdfParseFailed;
}

function contentTypeMismatchWarning(warnings: string[]): string | null {
  for (const warning of warnings) {
    if (/Content-Type/i.test(warning)) return warning;
  }
  return null;
}
