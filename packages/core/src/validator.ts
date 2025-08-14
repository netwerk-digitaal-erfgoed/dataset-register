/* eslint-disable-next-line @typescript-eslint/triple-slash-reference */
/// <reference path="./shacl-engine.d.ts" />

import factory from 'rdf-ext';
import { rdfDereferencer } from 'rdf-dereference';
import type { Dataset, DatasetCore } from '@rdfjs/types';
import { Validator as ShaclValidator } from 'shacl-engine';
import type { ValidationReport, ValidationResult as ShaclValidationResult } from 'shacl-engine';
import DatasetExt from 'rdf-ext/lib/Dataset.js';

export interface Validator {
  /**
   * Returns `null` if all datasets are valid or `DatasetCore` with failed constraints of the first invalid dataset.
   */
  validate(datasets: DatasetCore): Promise<ValidationResult>;
}

/**
 * Use shacl-engine instead of rdf-validate-shacl because it:
 * - supports detailed results for sh:node shapes nested in sh:or clauses;
 * - performs better.
 */
export class ShaclEngineValidator implements Validator {
  private inner: ShaclValidator;

  public constructor(dataset: DatasetCore) {
    this.inner = new ShaclValidator(dataset, { factory, details: true });
  }

  public static async fromUrl(url: string): Promise<ShaclEngineValidator> {
    return new this(await readUrl(url));
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

    const report = await this.inner.validate({ dataset });
    const state = hasViolation(report) ? 'invalid' : 'valid';

    return {
      state,
      errors: report.dataset,
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
  errors: DatasetExt;
};

export const shacl = (property: string) =>
  factory.namedNode(`http://www.w3.org/ns/shacl#${property}`);

/**
 * Check for severity Violation rather than {@link ValidationReport.conforms} because the latter is false on any
 * violation, including Info and Warning.
 */
const hasViolation = (report: ValidationReport) =>
  report.results.some((result) => resultIsViolation(result));

const resultIsViolation = (
  result: ShaclValidationResult,
): boolean => {
  const isViolation = result.severity.equals(shacl('Violation'));
  const hasChildren = result.results.length > 0;

  if (isViolation && !hasChildren) {
    return true;
  }

  return result.results
    // shacl-engine returns spurious NodeConstraintComponents, so only select the first one.
    .filter((item, index, self) => {
      if (item.constraintComponent.equals(shacl('NodeConstraintComponent'))) {
        return index === self.findIndex(t => t.constraintComponent.equals(shacl('NodeConstraintComponent')));
      }
      return true;
    })
    .some((nestedResult) => resultIsViolation(nestedResult));
};
