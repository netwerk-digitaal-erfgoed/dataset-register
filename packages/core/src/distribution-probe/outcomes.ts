import factory from 'rdf-ext';
import type { NamedNode } from '@rdfjs/types';
import {
  NetworkError,
  SparqlProbeResult,
  DataDumpProbeResult,
  type ProbeResultType,
} from '@lde/distribution-probe';

export const nde = (property: string): NamedNode =>
  factory.namedNode(`https://def.nde.nl#${property}`);

export const probeOutcomes = {
  NetworkError: nde('NetworkError'),
  NotFound: nde('NotFound'),
  ServerError: nde('ServerError'),
  AuthRequired: nde('AuthRequired'),
  RateLimited: nde('RateLimited'),
  ContentTypeHardMismatch: nde('ContentTypeHardMismatch'),
  ContentTypeMissing: nde('ContentTypeMissing'),
  EmptyBody: nde('EmptyBody'),
  SparqlProbeFailed: nde('SparqlProbeFailed'),
  RdfParseFailed: nde('RdfParseFailed'),
} as const;

export type ProbeOutcomeIri = (typeof probeOutcomes)[keyof typeof probeOutcomes];

export interface ProbeVerdict {
  success: boolean;
  outcome: ProbeOutcomeIri | null;
  detail: string | null;
}

/**
 * Classify a {@link ProbeResultType} into a success verdict plus, on failure, an
 * nde:ProbeOutcome IRI and a human-readable detail string. Content-type mismatches
 * on an otherwise successful probe surface as a failed verdict with a ContentTypeHardMismatch
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
      outcome: probeOutcomes.ContentTypeHardMismatch,
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
    return { success: false, outcome: probeOutcomes.ContentTypeMissing, detail };
  }
  return {
    success: false,
    outcome: probeOutcomes.ContentTypeHardMismatch,
    detail,
  };
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
