import {JsonLdParser} from 'jsonld-streaming-parser';
import {InvalidDataset, shacl, ShaclEngineValidator, Valid} from '../src/validator.js';
import {StreamParser} from 'n3';
import {Transform} from 'stream';
import {StandardizeSchemaOrgPrefixToHttps} from '../src/transform.js';
import {MicrodataRdfParser} from 'microdata-rdf-streaming-parser/lib/MicrodataRdfParser.js';
import {RdfaParser} from 'rdfa-streaming-parser/lib/RdfaParser.js';
import rdf from 'rdf-ext';
import type {Dataset} from '@rdfjs/types';
import {file} from '../src/test-utils.js';

const validator = await ShaclEngineValidator.fromUrl('../../requirements/shacl.ttl');

describe('Validator', () => {
  it('accepts minimal valid Schema.org dataset', async () => {
    const report = (await validate(
      'dataset-schema-org-valid-minimal.jsonld',
    )) as Valid;
    expect(report.state).toEqual('valid');
    expectViolations(report, ['https://schema.org/description']);
    expectViolations(report, ['https://schema.org/distribution']);
  });

  it('accepts minimal valid Schema.org dataset in Turtle', async () => {
    const report = await validate(
      'dataset-http-schema-org-valid.ttl',
      new StreamParser(),
    );
    expect(report.state).toEqual('valid');
  });

  it('accepts minimal valid Schema.org dataset in Microdata', async () => {
    const report = await validate(
      'dataset-schema-org-valid-microdata.html',
      new MicrodataRdfParser(),
    );
    expect(report.state).toEqual('valid');
  });

  it('accepts minimal valid Schema.org dataset in HTML+RDFa', async () => {
    const report = await validate(
      'dataset-schema-org-valid-rdfa.html',
      new RdfaParser(),
    );
    expect(report.state).toEqual('valid');
  });

  it('accepts minimal valid Schema.org dataset with separate organization', async () => {
    const report = await validate(
      'dataset-schema-org-valid-plus-organization.jsonld',
    );
    expect(report.state).toEqual('valid');
  });

  it('accepts valid Schema.org dataset', async () => {
    const report = await validate('dataset-schema-org-valid.jsonld');
    expect(report.state).toEqual('valid');
  });

  it('reports invalid Schema.org dataset', async () => {
    const report = await validate('dataset-schema-org-invalid.jsonld') as InvalidDataset;
    expect(report.state).toBe('invalid');
    expectViolations(report, ['https://schema.org/contentUrl']);
    expectViolations(report, ['https://schema.org/dateCreated']);
    expectViolations(report, ['https://schema.org/datePublished']);
    expectViolations(report, ['https://schema.org/dateModified']);
  });

  it('accepts valid Schema.org dataset without publisher', async () => {
    const report = await validate(
      'dataset-schema-org-valid-no-publisher.jsonld',
    ) as Valid;
    expect(report.state).toEqual('valid');
    expect(report.state === 'valid');
    expectViolations(report, ['https://schema.org/publisher']);
    expect(
      (report as Valid).errors.match(
        null,
        shacl('resultSeverity'),
        shacl('Warning'),
      ).size,
    ).toEqual(6);
  });

  it('accepts valid HTTP Schema.org dataset', async () => {
    const report = await validate('dataset-http-schema-org-valid.jsonld');
    expect(report.state).toEqual('valid');
  });

  it('reports invalid HTTP Schema.org dataset', async () => {
    const report = await validate('dataset-http-schema-org-invalid.jsonld');
    expect(report.state).toBe('invalid');
    expectViolations(report as InvalidDataset, ['https://schema.org/name']);
    expectViolations(report as InvalidDataset, [
      'https://schema.org/publisher',
    ]);
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
    expectViolations(report as InvalidDataset, ['https://schema.org/name']);
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

  it('reports nested violations', async () => {
    const report = (await validate(
      'dataset-schema-org-multiple-alternate-names.ttl',
      new StreamParser(),
    )) as Valid;

    expect(report.state).toEqual('valid');

    // Once for creator and once for publisher.
    expectViolations(report, ['https://schema.org/alternateName'], 2);

    // If dataset is valid, any parent violations must be removed.
    expect(
      report.errors.match(
        null,
        shacl('resultSeverity'),
        shacl('Violation'),
      ).size,
    ).toEqual(0);
  });

  it('reports missing class', async () => {
    const report = await validate('dataset-schema-missing-publisher-class.ttl', new StreamParser());
    expect(report.state).toEqual('invalid');
  });
});

export const validate = async (filename: string, parser?: Transform) =>
  validator.validate(await dataset(filename, parser));

const dataset = async (filename: string, parser?: Transform) => {
  const content = await file(filename);
  const {Readable} = await import('stream');
  const stream = Readable.from([content]);

  return (await rdf.dataset().import(
    stream
      .pipe(parser ?? (new JsonLdParser() as unknown as Transform))
      .pipe(new StandardizeSchemaOrgPrefixToHttps()),
  )) as unknown as Dataset;
};

const expectViolations = (
  report: InvalidDataset | Valid,
  violationPaths: string[],
  number = 1
) =>
  violationPaths.forEach(violationPath => {
      const violations = report.errors.match(
        null,
        shacl('resultPath'),
        rdf.namedNode(violationPath),
      );

      expect(violations.size).toEqual(number);
    }
  );
