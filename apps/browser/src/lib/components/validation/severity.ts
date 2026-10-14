import * as m from '$lib/paraglide/messages';
import type { Severity } from '$lib/services/shacl-report.js';

// How a SHACL result’s severity is shown: in the validation report and in the
// dataset page’s list of broken SCHEMA-AP-NDE rules.
export function severityTone(severity: Severity): 'red' | 'yellow' | 'blue' {
  switch (severity) {
    case 'Violation':
      return 'red';
    case 'Warning':
      return 'yellow';
    case 'Info':
      return 'blue';
  }
}

export function severityLabel(severity: Severity): string {
  switch (severity) {
    case 'Violation':
      return m.severity_Violation();
    case 'Warning':
      return m.severity_Warning();
    case 'Info':
      return m.severity_Info();
  }
}
