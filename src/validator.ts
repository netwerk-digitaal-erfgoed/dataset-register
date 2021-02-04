import fs from 'fs';
import {DatasetCore} from 'rdf-js';
import factory from 'rdf-ext';
import rdfParser from 'rdf-parse';
import SHACLValidator from 'rdf-validate-shacl';

export interface Validator {
  /**
   * Returns `null` if all datasets are valid or `DatasetCore` with failed constraints of the first invalid dataset.
   */
  validate(datasets: DatasetCore[]): Promise<DatasetCore | null>;
}

export class ShaclValidator implements Validator {
  private inner: typeof SHACLValidator;

  public static async fromUrl(url: string): Promise<ShaclValidator> {
    return new this(await readUrl(url));
  }

  public constructor(dataset: DatasetCore) {
    this.inner = new SHACLValidator(dataset);
  }

  public async validate(datasets: DatasetCore[]): Promise<DatasetCore | null> {
    for (const dataset of datasets) {
      const queryResultValidationReport = this.inner.validate(dataset);
      if (!queryResultValidationReport.conforms) {
        return queryResultValidationReport.dataset;
      }
    }

    return null;
  }
}

async function readUrl(url: string): Promise<DatasetCore> {
  const fileStream = fs.createReadStream(url);
  const rdfStream = rdfParser.parse(fileStream, {path: url});
  return await factory.dataset().import(rdfStream);
}
