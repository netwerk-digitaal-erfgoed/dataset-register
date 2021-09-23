import factory from 'rdf-ext';
import {JsonLdParser} from 'jsonld-streaming-parser';
import * as fs from 'fs';
import {
  InvalidDataset,
  shacl,
  ShaclValidator,
  Valid,
  Validator,
} from '../src/validator';

let validator: Validator;

describe('Validator', () => {
  beforeAll(async () => {
    validator = await ShaclValidator.fromUrl('shacl/register.ttl');
  });

  it('accepts minimal valid Schema.org dataset', async () => {
    const report = await validate('dataset-schema-org-valid.jsonld');
    expect(report.state).toEqual('valid');
  });

  it('accepts minimal valid Schema.org dataset', async () => {
    const report = await validate(
      'dataset-schema-org-valid-plus-organization.jsonld'
    );
    expect(report.state).toEqual('valid');
  });

  it('reports invalid Schema.org dataset', async () => {
    const report = await validate('dataset-schema-org-invalid.jsonld');
    expect(report.state).toBe('invalid');
  });

  it('accepts valid Schema.org dataset without publisher', async () => {
    const report = await validate(
      'dataset-schema-org-valid-no-publisher.jsonld'
    );
    expect(report.state).toEqual('valid');
    expect(report.state === 'valid');
    expect(
      (report as Valid).errors.match(
        null,
        shacl('resultSeverity'),
        shacl('Warning')
      ).size
    ).toEqual(1);
  });

  it('accepts valid HTTP Schema.org dataset', async () => {
    const report = await validate('dataset-http-schema-org-valid.jsonld');
    expect(report.state).toEqual('valid');
  });

  it('reports invalid HTTP Schema.org dataset', async () => {
    const report = await validate('dataset-http-schema-org-invalid.jsonld');
    expect(report.state).toBe('invalid');
    expectViolations(report as InvalidDataset, ['http://schema.org/name']);
    expectViolations(report as InvalidDataset, ['http://schema.org/publisher']);
  });

  it('accepts valid DCAT dataset', async () => {
    const report = await validate('dataset-dcat-valid.jsonld');
    expect(report.state).toEqual('valid');
  });

  it('reports invalid DCAT dataset', async () => {
    const report = await validate('dataset-dcat-invalid.jsonld');
    expect(report.state).toBe('invalid');
  });

  it('accepts valid Schema.org catalog', async () => {
    const report = await validate('catalog-schema-org-valid.jsonld');
    expect(report.state).toEqual('valid');
  });

  it('reports empty Schema.org catalog', async () => {
    const report = await validate('catalog-schema-org-no-dataset.jsonld');
    expect(report.state).toEqual('no-dataset');
  });

  it('reports invalid Schema.org catalog', async () => {
    const report = await validate('catalog-schema-org-invalid.jsonld');
    expect(report.state).toEqual('invalid');
    expectViolations(report as InvalidDataset, ['http://schema.org/name']);
  });

  it('accepts valid DCAT catalog', async () => {
    const report = await validate('catalog-dcat-valid.jsonld');
    expect(report.state).toEqual('valid');
  });

  it('reports invalid DCAT catalog', async () => {
    const report = await validate('catalog-dcat-invalid.jsonld');
    expect(report.state).toEqual('no-dataset');
  });

  it('accepts a list of valid Schema.org datasets', async () => {
    const report = await validate('datasets-schema-org-valid.jsonld');
    expect(report.state).toEqual('valid');
  });

  it('rejects a list that contains at least one invalid Schema.org dataset', async () => {
    const report = await validate('datasets-schema-org-invalid.jsonld');
    expect(report).not.toBeNull();
  });

  it('accepts a list of valid DCAT datasets', async () => {
    const report = await validate('datasets-dcat-valid.jsonld');
    expect(report.state).toEqual('valid');
  });

  it('rejects a list that contains at least one invalid DCAT dataset', async () => {
    const report = await validate('datasets-dcat-invalid.jsonld');
    expect(report).not.toBeNull();
  });

  it('rejects empty RDF', async () => {
    const report = await validate('empty.jsonld');
    expect(report.state).toEqual('no-dataset');
  });

  it('rejects RDF that contains no dataset', async () => {
    const report = await validate('no-dataset.jsonld');
    expect(report.state).toEqual('no-dataset');
  });

  it('rejects a dataset that has no IRI', async () => {
    const report = await validate('dataset-invalid-no-iri.jsonld');
    expect(report.state).toEqual('no-dataset');
  });

  it('rejects a dataset that has no HTTP IRI', async () => {
    const report = await validate('dataset-invalid-no-http-iri.jsonld');
    expect(report.state).toEqual('no-dataset');
  });
});

const validate = async (filename: string) =>
  validator.validate(await dataset(filename));

const dataset = async (filename: string) => {
  const jsonLdParser = new JsonLdParser();
  // const b = factory.dataset();
  return await factory
    .dataset()
    .import(
      fs.createReadStream(`test/datasets/${filename}`).pipe(jsonLdParser)
    );
};

const expectViolations = (report: InvalidDataset, violationPaths: string[]) =>
  violationPaths.forEach(violationPath =>
    expect(
      report.errors.match(
        null,
        shacl('resultPath'),
        factory.namedNode(violationPath)
      ).size
    ).toEqual(1)
  );
