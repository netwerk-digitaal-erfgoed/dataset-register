declare module 'shacl-engine' {
  import type { Dataset, DatasetCore, NamedNode, Term } from '@rdfjs/types';

  export interface ValidatorOptions {
    factory?: unknown;
    details?: boolean;
    validations?: Map<Term, unknown>;
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
    validate(options: { dataset: DatasetCore }): Promise<ValidationReport>;
  }
}

declare module 'shacl-engine/sparql.js' {
  import type { Term } from '@rdfjs/types';
  export const validations: Map<Term, unknown>;
}
