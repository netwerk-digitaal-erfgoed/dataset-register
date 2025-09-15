declare module 'shacl-engine' {
  import type { Dataset, DatasetCore, NamedNode } from '@rdfjs/types';
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
    dataset: Dataset;
    results: ValidationResult[];
    conforms: boolean;
  }

  export class Validator {
    constructor(shapes: DatasetCore, options?: ValidatorOptions);
    validate(options: { dataset: Dataset }): Promise<ValidationReport>;
  }
}
