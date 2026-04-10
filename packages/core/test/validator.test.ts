import { JsonLdParser } from 'jsonld-streaming-parser';
import {
  InvalidDataset,
  shacl,
  ShaclEngineValidator,
  Valid,
} from '../src/validator.js';
import { StreamParser } from 'n3';
import { Transform } from 'stream';
import { MicrodataRdfParser } from 'microdata-rdf-streaming-parser/lib/MicrodataRdfParser.js';
import { RdfaParser } from 'rdfa-streaming-parser/lib/RdfaParser.js';
import rdf from 'rdf-ext';
import type { Dataset } from '@rdfjs/types';
import { file } from '../src/test-utils.js';
import { Readable } from 'node:stream';

const validator = await ShaclEngineValidator.fromUrl(
  '../../requirements/shacl.ttl',
);

describe('Validator', () => {
  it('accepts minimal valid Schema.org dataset', async () => {
    const report = (await validate(
      'dataset-schema-org-valid-minimal.jsonld',
    )) as Valid;
    expect(report.state).toEqual('valid');
    expectViolations(report, ['https://schema.org/description']);
    expectViolations(report, ['https://schema.org/distribution']);
    expect(
      report.errors.match(
        null,
        shacl('conforms'),
        rdf.literal(
          'false',
          rdf.namedNode('http://www.w3.org/2001/XMLSchema#boolean'),
        ),
      ).size,
    ).toEqual(1);
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
    const report = (await validate(
      '../../../../requirements/examples/dataset-schema-org-valid.jsonld',
    )) as Valid;

    const blankNode = rdf.blankNode();
    const expectedDataset = rdf.dataset([
      rdf.quad(
        blankNode,
        rdf.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
        shacl('ValidationReport'),
      ),
      rdf.quad(
        blankNode,
        shacl('conforms'),
        rdf.literal(
          'true',
          rdf.namedNode('http://www.w3.org/2001/XMLSchema#boolean'),
        ),
      ),
    ]) as unknown as Dataset;
    expect(report.errors.toCanonical()).toEqual(expectedDataset.toCanonical());
  });

  it('reports invalid Schema.org dataset', async () => {
    const report = (await validate(
      'dataset-schema-org-invalid.jsonld',
    )) as InvalidDataset;
    expect(report.state).toBe('invalid');
    expectViolations(report, ['https://schema.org/contentUrl']);
    expectViolations(report, ['https://schema.org/dateCreated']);
    expectViolations(report, ['https://schema.org/datePublished']);
    expectViolations(report, ['https://schema.org/dateModified']);
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

  it('reports invalid ContactPoint (recommended but must meet criteria if provided)', async () => {
    const report = await validate(
      'dataset-schema-org-invalid-contactpoint.jsonld',
    );
    expect(report.state).toBe('invalid');
    expectViolations(report as InvalidDataset, ['https://schema.org/email'], 2);
  });

  it('accepts valid DCAT dataset', async () => {
    const report = await validate('dataset-dcat-valid.jsonld');
    expect(report.state).toEqual('valid');
  });

  it('accepts valid DCAT dataset with untagged organization name', async () => {
    const report = await validate('dataset-dcat-valid-no-lang-tag.jsonld');
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
    expectViolations(report as InvalidDataset, ['https://schema.org/name'], 3);
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

  it('captures full SHACL feedback for Gouda Tijdmachine fixture', async () => {
    const report = (await validate(
      'dataset-schema-org-gouda-tijdmachine.ttl',
      new StreamParser(),
    )) as Valid;

    expect(report.state).toEqual('valid');
    expect(formatReport(report)).toMatchInlineSnapshot(`
      "[Warning]  on <http://creativecommons.org/publicdomain/zero/1.0/deed.nl>: Use the canonical Creative Commons license URI with https:// (e.g. https://creativecommons.org/publicdomain/zero/1.0/)
      [Warning]  on <http://creativecommons.org/publicdomain/zero/1.0/deed.nl>: Use the canonical Creative Commons license URI with https:// (e.g. https://creativecommons.org/publicdomain/zero/1.0/)
      [Warning]  on <https://www.goudatijdmachine.nl/omeka/api/items/232>: 
      [Warning]  on <https://www.goudatijdmachine.nl/omeka/api/items/232>: 
      [Warning]  on <https://www.goudatijdmachine.nl/omeka/api/items/232>: 
      [Warning]  on <https://www.goudatijdmachine.nl/omeka/api/items/232>: 
      [Warning]  on <https://www.goudatijdmachine.nl/omeka/api/items/232>: 
      [Warning]  on <https://www.goudatijdmachine.nl/omeka/api/items/232>: 
      [Warning]  on <https://www.goudatijdmachine.nl/omeka/api/items/232>: 
      [Warning]  on <https://www.goudatijdmachine.nl/omeka/api/items/232>: 
      [Warning]  on <https://www.goudatijdmachine.nl/omeka/api/items/232>: 
      [Warning]  on <https://www.goudatijdmachine.nl/omeka/api/items/232>: 
      [Warning]  on <https://www.goudatijdmachine.nl/omeka/api/items/232>: 
      [Warning]  on <https://www.goudatijdmachine.nl/omeka/api/items/232>: 
      [Warning]  on <https://www.goudatijdmachine.nl/omeka/api/items/232>: 
      [Warning]  on <https://www.goudatijdmachine.nl/omeka/api/items/232>: 
      [Warning]  on <https://www.goudatijdmachine.nl/omeka/api/items/232>: 
      [Warning] https://schema.org/contactPoint on <https://www.goudatijdmachine.nl/omeka/api/items/232>: An organization must have a ContactPoint
      [Warning] https://schema.org/contactPoint on <https://www.goudatijdmachine.nl/omeka/api/items/232>: An organization must have a ContactPoint
      [Warning] https://schema.org/contactPoint on <https://www.goudatijdmachine.nl/omeka/api/items/232>: An organization must have a ContactPoint
      [Warning] https://schema.org/contactPoint on <https://www.goudatijdmachine.nl/omeka/api/items/232>: An organization must have a ContactPoint
      [Warning] https://schema.org/contactPoint on <https://www.goudatijdmachine.nl/omeka/api/items/232>: An organization must have a ContactPoint
      [Warning] https://schema.org/creator on <https://www.goudatijdmachine.nl/omeka/api/items/3030723>: A dataset description should contain a creator
      [Warning] https://schema.org/creator on <https://www.goudatijdmachine.nl/omeka/api/items/3030723>: A dataset description should contain a creator
      [Warning] https://schema.org/dataset on <https://www.goudatijdmachine.nl/omeka/api/items/12997>: A data catalog must have at least one dataset
      [Warning] https://schema.org/identifier on <https://www.goudatijdmachine.nl/omeka/api/items/232>: An organization must have one or more identifiers
      [Warning] https://schema.org/identifier on <https://www.goudatijdmachine.nl/omeka/api/items/232>: An organization must have one or more identifiers
      [Warning] https://schema.org/identifier on <https://www.goudatijdmachine.nl/omeka/api/items/232>: An organization must have one or more identifiers
      [Warning] https://schema.org/identifier on <https://www.goudatijdmachine.nl/omeka/api/items/232>: An organization must have one or more identifiers
      [Warning] https://schema.org/identifier on <https://www.goudatijdmachine.nl/omeka/api/items/232>: An organization must have one or more identifiers
      [Warning] https://schema.org/license on <https://www.goudatijdmachine.nl/omeka/api/items/3030723>: A dataset description must contain one license (in the form of a URI)
      [Warning] https://schema.org/license on <https://www.goudatijdmachine.nl/omeka/api/items/3030723>: A dataset description must contain one license (in the form of a URI)
      [Warning] https://schema.org/license on <https://www.goudatijdmachine.nl/omeka/api/items/3030723>: Use one of the recommended canonical license URIs
      [Warning] https://schema.org/license on <https://www.goudatijdmachine.nl/omeka/api/items/3030723>: Use one of the recommended canonical license URIs
      [Warning] https://schema.org/publisher on <https://www.goudatijdmachine.nl/omeka/api/items/12997>: A data catalog must have a valid publisher
      [Warning] https://schema.org/publisher on <https://www.goudatijdmachine.nl/omeka/api/items/3030723>: A dataset description must contain a valid publisher (without warnings)
      [Warning] https://schema.org/publisher on <https://www.goudatijdmachine.nl/omeka/api/items/3030723>: A dataset description must contain a valid publisher (without warnings)"
    `);
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
      report.errors.match(null, shacl('resultSeverity'), shacl('Violation'))
        .size,
    ).toEqual(0);
  });

  it('does not validate inline DataCatalog from includedInDataCatalog', async () => {
    const report = await validate(
      'dataset-schema-org-valid-included-in-data-catalog.jsonld',
    );

    expect(report.state).toEqual('valid');
  });

  it('reports includedInDataCatalog as string literal instead of IRI', async () => {
    const report = (await validate(
      'dataset-schema-org-invalid-included-in-data-catalog.jsonld',
    )) as Valid;

    expect(report.state).toEqual('valid');
    expectViolations(report, ['https://schema.org/includedInDataCatalog'], 2);
  });

  it('reports spatialCoverage as string literal instead of IRI', async () => {
    const report = (await validate(
      'dataset-schema-org-invalid-spatial-coverage.jsonld',
    )) as Valid;

    expect(report.state).toEqual('valid');
    expectViolations(report, ['https://schema.org/spatialCoverage'], 2);
  });

  it('reports sameAs as string literal instead of IRI', async () => {
    const report = (await validate(
      'dataset-schema-org-invalid-sameas.ttl',
      new StreamParser(),
    )) as Valid;

    expect(report.state).toEqual('valid');
    // Once for creator and once for publisher (both reference the same organization).
    expectViolations(report, ['https://schema.org/sameAs'], 2);
  });

  it('reports non-canonical Creative Commons license URI as warning, not violation', async () => {
    const report = (await validate(
      'dataset-schema-org-license-deed.jsonld',
    )) as Valid;
    expect(report.state).toEqual('valid');
    expectViolations(report, ['https://schema.org/license'], 2);
  });

  it('reports invalid encoding format', async () => {
    const report = await validate(
      'dataset-schema-org-invalid-encoding-format.jsonld',
    );
    expect(report.state).toBe('invalid');
    expectViolations(report as InvalidDataset, [
      'https://schema.org/encodingFormat',
    ]);
  });

  it('reports missing class', async () => {
    const report = await validate(
      'dataset-schema-missing-publisher-class.ttl',
      new StreamParser(),
    );
    expect(report.state).toEqual('invalid');
  });

  it('reports dataset with no license on either dataset or distribution', async () => {
    const report = await validate('dataset-schema-org-no-license.jsonld');
    expect(report.state).toBe('invalid');
  });

  it('accepts dataset with license on dataset but not on distribution', async () => {
    const report = await validate('dataset-schema-org-valid-minimal.jsonld');
    expect(report.state).toEqual('valid');
  });
});

export const validate = async (filename: string, parser?: Transform) =>
  validator.validate(await dataset(filename, parser));

const dataset = async (filename: string, parser?: Transform) => {
  const content = await file(filename);
  const stream = Readable.from(content);

  return (await rdf
    .dataset()
    .import(
      stream.pipe(parser ?? (new JsonLdParser() as unknown as Transform)),
    )) as unknown as Dataset;
};

const formatReport = (report: InvalidDataset | Valid): string => {
  const resultType = rdf.namedNode(
    'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
  );
  const resultNodes = [
    ...report.errors.match(null, resultType, shacl('ValidationResult')),
  ].map((quad) => quad.subject);

  const lines = resultNodes.map((node) => {
    const severity =
      [...report.errors.match(node, shacl('resultSeverity'), null)][0]?.object
        .value.split('#')
        .pop() ?? '';
    const path =
      [...report.errors.match(node, shacl('resultPath'), null)][0]?.object
        .value ?? '';
    const focus =
      [...report.errors.match(node, shacl('focusNode'), null)][0]?.object
        .value ?? '';
    const message =
      [...report.errors.match(node, shacl('resultMessage'), null)].find(
        (quad) =>
          quad.object.termType === 'Literal' && quad.object.language === 'en',
      )?.object.value ?? '';
    return `[${severity}] ${path} on <${focus}>: ${message}`;
  });

  return lines.sort().join('\n');
};

const expectViolations = (
  report: InvalidDataset | Valid,
  violationPaths: string[],
  number = 1,
) =>
  violationPaths.forEach((violationPath) => {
    const violations = report.errors.match(
      null,
      shacl('resultPath'),
      rdf.namedNode(violationPath),
    );

    expect(violations.size).toEqual(number);
  });
