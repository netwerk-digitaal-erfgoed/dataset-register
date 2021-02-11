import factory from 'rdf-ext';
import {JsonLdParser} from 'jsonld-streaming-parser';
import * as fs from 'fs';
import {ShaclValidator, Validator} from '../src/validator';

let validator: Validator;

describe('Validator', () => {
  beforeAll(async () => {
    validator = await ShaclValidator.fromUrl('shacl/dataset.jsonld');
  });

  it('accepts valid Schema.org datasets', async () => {
    expect(await validate('dataset-schema-org-valid.jsonld')).toBeNull();
  });

  it('reports invalid Schema.org datasets', async () => {
    const report = await validate('dataset-schema-org-invalid.jsonld');
    expect(report).not.toBeNull();
  });

  it('accepts valid Schema.org catalog', async () => {
    const report = await validate('catalog-schema-org-valid.jsonld');
    expect(report).toBeNull();
  });

  it('reports invalid Schema.org catalog', async () => {
    const report = await validate('catalog-schema-org-invalid.jsonld');
    expect(report).not.toBeNull();
  });

  it('accepts a list of valid Schema.org datasets', async () => {
    const report = await validate('datasets-schema-org-valid.jsonld');
    expect(report).toBeNull();
  });

  it('rejects a list that contains at least one invalid Schema.org dataset', async () => {
    const report = await validate('datasets-schema-org-valid.jsonld');
    expect(report).not.toBeNull();
  });

  it('rejects empty JSON', async () => {
    const report = await validate('empty.jsonld');
    expect(report).not.toBeNull();
  });
});

const validate = async (filename: string) =>
  validator.validate([await dataset(filename)]);

const dataset = async (filename: string) => {
  const jsonLdParser = new JsonLdParser();
  return await factory
    .dataset()
    .import(
      fs.createReadStream(`test/datasets/${filename}`).pipe(jsonLdParser)
    );
};
