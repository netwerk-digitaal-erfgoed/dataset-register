import type { DatasetCore } from '@rdfjs/types';
import { shacl } from './validator.ts';
import { REGISTRATION_STATUS_BASE_URI } from './constants.ts';

const VALIDATION_REPORT_GRAPH_BASE = `${REGISTRATION_STATUS_BASE_URI}shacl-validation/`;

/**
 * Named graph holding a registration's full SHACL validation report, keyed by
 * the registration URL. One graph per registration, replaced on each crawl, so
 * the report (and its warnings) can be queried without parsing files. Mirrors
 * the Dataset Knowledge Graph's per-dataset `shacl-validation` graph scheme.
 */
export function validationReportGraphIri(registrationUrl: URL): URL {
  return new URL(
    VALIDATION_REPORT_GRAPH_BASE +
      encodeURIComponent(registrationUrl.toString()),
  );
}

export interface ValidationReportStore {
  /**
   * Store a registration's SHACL validation report, replacing any report
   * previously stored for the same registration URL.
   */
  store(registrationUrl: URL, report: DatasetCore): Promise<void>;
  /**
   * Delete a registration's stored validation report.
   */
  delete(registrationUrl: URL): Promise<void>;
}

/**
 * The number of `sh:Warning`-severity results in a SHACL validation report:
 * how far a registration's description is from full validity, separate from any
 * completeness score. SHACL warnings and probe-emitted warnings alike are
 * counted, since both carry `sh:resultSeverity sh:Warning`.
 */
export function countWarnings(report: DatasetCore): number {
  return report.match(undefined, shacl('resultSeverity'), shacl('Warning'))
    .size;
}
