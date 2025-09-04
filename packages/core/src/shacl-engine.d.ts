declare module 'shacl-engine' {
  import type { DatasetCore, NamedNode } from '@rdfjs/types';
  import DatasetExt from 'rdf-ext/lib/Dataset.js';

  export interface ValidatorOptions {
    factory?: unknown;
    details?: boolean;
  }

  export interface ValidationResult {
    severity: NamedNode;
    constraintComponent: NamedNode;
    results: ValidationResult[];
  }

  export interface ValidationReport {
    dataset: DatasetExt;
    results: ValidationResult[];
    conforms: boolean;
  }

  export class Validator {
    constructor(shapes: DatasetCore, options?: ValidatorOptions);
    validate(options: { dataset: DatasetCore }): Promise<ValidationReport>;
  }
}
