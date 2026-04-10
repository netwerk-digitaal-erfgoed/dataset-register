/* eslint-disable-next-line @typescript-eslint/triple-slash-reference */
/// <reference path="./shacl-engine.d.ts" />

import factory from 'rdf-ext';
import { rdfDereferencer } from 'rdf-dereference';
import type { Dataset, DatasetCore } from '@rdfjs/types';
import type { ValidationReport } from 'shacl-engine';
import { Validator as ShaclValidator } from 'shacl-engine';
import { validations as sparqlValidations } from 'shacl-engine/sparql.js';
import { standardizeSchemaOrgPrefix } from './transform.ts';

export interface Validator {
  validate(datasets: DatasetCore): Promise<ValidationResult>;
}

/**
 * Use shacl-engine instead of rdf-validate-shacl for its performance and SPARQL constraint support.
 */
export class ShaclEngineValidator implements Validator {
  private inner: ShaclValidator;

  public constructor(dataset: DatasetCore) {
    this.inner = new ShaclValidator(dataset, {
      factory,
      validations: sparqlValidations,
    });
  }

  public static async fromUrl(url: string): Promise<ShaclEngineValidator> {
    return new this(await readUrl(url));
  }

  public async validate(input: DatasetCore): Promise<ValidationResult> {
    const dataset = standardizeSchemaOrgPrefix(input);
    const datasetIris = dataset.filter(
      (quad) =>
        quad.subject.termType === 'NamedNode' && // Prevent blank nodes
        quad.predicate.value ===
          'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' &&
        (quad.object.value === 'https://schema.org/Dataset' ||
          quad.object.value === 'http://www.w3.org/ns/dcat#Dataset'),
    );
    if (datasetIris.size === 0) {
      return { state: 'no-dataset' };
    }

    const report = await this.inner.validate({ dataset });
    return {
      state: hasViolation(report) ? 'invalid' : 'valid',
      errors: report.dataset,
    };
  }
}

export async function readUrl(url: string): Promise<DatasetCore> {
  const { data } = await rdfDereferencer.dereference(url.toString(), {
    localFiles: true,
  });

  return await factory.dataset().import(data);
}

type ValidationResult = Valid | NoDataset | InvalidDataset;

export type Valid = {
  state: 'valid';
  errors: Dataset;
};

type NoDataset = {
  state: 'no-dataset';
};

export type InvalidDataset = {
  state: 'invalid';
  errors: Dataset;
};

export const shacl = (property: string) =>
  factory.namedNode(`http://www.w3.org/ns/shacl#${property}`);

/**
 * Check for severity Violation rather than {@link ValidationReport.conforms} because the latter is false on any
 * violation, including Info and Warning.
 */
const hasViolation = (report: ValidationReport) =>
  report.results.some((result) => result.severity.equals(shacl('Violation')));
