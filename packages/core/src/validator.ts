import factory from 'rdf-ext';
import SHACLValidator from 'rdf-validate-shacl';
import ValidationReport from 'rdf-validate-shacl/src/validation-report.js';
import {rdfDereferencer} from 'rdf-dereference';
import {Dataset, DatasetCore} from '@rdfjs/types';

export interface Validator {
  /**
   * Returns `null` if all datasets are valid or `DatasetCore` with failed constraints of the first invalid dataset.
   */
  validate(datasets: DatasetCore): Promise<ValidationResult>;
}

export class ShaclValidator implements Validator {
  private inner: SHACLValidator;

  public static async fromUrl(url: string): Promise<ShaclValidator> {
    return new this(await readUrl(url));
  }

  public constructor(dataset: DatasetCore) {
    this.inner = new SHACLValidator(dataset);
  }

  public async validate(dataset: Dataset): Promise<ValidationResult> {
    const datasetIris = dataset.filter(
      quad =>
        quad.subject.termType === 'NamedNode' && // Prevent blank nodes
        quad.predicate.value ===
          'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' &&
        (quad.object.value === 'https://schema.org/Dataset' ||
          quad.object.value === 'http://www.w3.org/ns/dcat#Dataset'),
    );
    if (datasetIris.size === 0) {
      return {state: 'no-dataset'};
    }

    const queryResultValidationReport = this.inner.validate(dataset);
    const state = hasViolation(queryResultValidationReport)
      ? 'invalid'
      : 'valid';

    return {
      state: state,
      errors: queryResultValidationReport.dataset,
    };
  }
}

export async function readUrl(url: string): Promise<DatasetCore> {
  const {data} = await rdfDereferencer.dereference(url.toString(), {
    localFiles: true,
  });

  return await factory.dataset().import(data);
}

type ValidationResult = Valid | NoDataset | InvalidDataset;

export type Valid = {
  state: 'valid';
  errors: DatasetCore;
};

type NoDataset = {
  state: 'no-dataset';
};

export type InvalidDataset = {
  state: 'invalid';
  errors: DatasetCore;
};

export const shacl = (property: string) =>
  factory.namedNode(`http://www.w3.org/ns/shacl#${property}`);

/**
 * Check for severity Violation rather than {@see ValidationReport.conforms} because the latter is false on any
 * violation, including Info and Warning.
 */
const hasViolation = (report: ValidationReport) =>
  report.results.some((result) => resultIsViolation(result));

const resultIsViolation = (
  result: ValidationReport.ValidationResult,
): boolean => {
  return (
    result.severity?.value === shacl('Violation').value ||
    result.detail?.some((detail) => resultIsViolation(detail))
  );
};
