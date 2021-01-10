import fs from 'fs';
import {DatasetCore} from 'rdf-js';
import factory from 'rdf-ext';
import rdfParser from 'rdf-parse';
import SHACLValidator from 'rdf-validate-shacl';

export class ShaclValidator {
  private inner: typeof SHACLValidator;

  public static async fromUrl(url: string): Promise<ShaclValidator> {
    return new this(await readUrl(url));
  }

  public constructor(dataset: DatasetCore) {
    this.inner = new SHACLValidator(dataset);
  }

  public async validate(dataset: DatasetCore) {
    return this.inner.validate(dataset);
  }
}

async function readUrl(url: string): Promise<DatasetCore> {
  const fileStream = fs.createReadStream(url);
  const rdfStream = rdfParser.parse(fileStream, {path: url});
  return await factory.dataset().import(rdfStream);
}
