declare module 'shacl-engine' {
  import type { DatasetCore, NamedNode } from '@rdfjs/types';

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
    dataset: DatasetCore;
    results: ValidationResult[];
    conforms: boolean;
  }

  export class Validator {
    constructor(shapes: DatasetCore, options?: ValidatorOptions);
    validate(options: { dataset: DatasetCore }): Promise<ValidationReport>;
  }
}
