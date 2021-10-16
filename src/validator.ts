import fs from 'fs';
import {DatasetCore} from 'rdf-js';
import factory from 'rdf-ext';
import rdfParser from 'rdf-parse';
import SHACLValidator from 'rdf-validate-shacl';
import DatasetExt from 'rdf-ext/lib/Dataset';
import ValidationReport from 'rdf-validate-shacl/src/validation-report';

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

  public async validate(dataset: DatasetExt): Promise<ValidationResult> {
    const datasetIris = dataset.filter(
      quad =>
        quad.subject.termType === 'NamedNode' && // Prevent blank nodes
        quad.predicate.value ===
          'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' &&
        (quad.object.value === 'https://schema.org/Dataset' ||
          quad.object.value === 'http://www.w3.org/ns/dcat#Dataset')
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
  const fileStream = fs.createReadStream(url);
  const rdfStream = rdfParser.parse(fileStream, {path: url});
  return await factory.dataset().import(rdfStream);
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
  report.results.some(
    (result: ValidationReport.ValidationResult) =>
      result.severity?.value === shacl('Violation').value
  );
