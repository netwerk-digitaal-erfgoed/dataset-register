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
    expectViolations(report as InvalidDataset, ['https://schema.org/email']);
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
    expectViolations(report as InvalidDataset, ['https://schema.org/name'], 2);
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

  it('SPARQL-constrained Organization checks produce fully structured results', async () => {
    const report = (await validate(
      'dataset-schema-org-gouda-tijdmachine.ttl',
      new StreamParser(),
    )) as Valid;

    const first = (predicate: ReturnType<typeof shacl>, object: unknown) =>
      [...report.errors.match(null, predicate, object as never)][0]?.subject;
    const literal = (subject: unknown, predicate: ReturnType<typeof shacl>) =>
      [...report.errors.match(subject as never, predicate, null)][0]?.object
        .value;

    const contactPointResult = first(
      shacl('resultPath'),
      rdf.namedNode('https://schema.org/contactPoint'),
    );
    const identifierResult = first(
      shacl('resultPath'),
      rdf.namedNode('https://schema.org/identifier'),
    );
    expect(contactPointResult).toBeDefined();
    expect(identifierResult).toBeDefined();

    for (const [result, expectedMessage] of [
      [contactPointResult, 'An organization must have a ContactPoint'],
      [identifierResult, 'An organization must have one or more identifiers'],
    ] as const) {
      expect(literal(result, shacl('focusNode'))).toEqual(
        'https://www.goudatijdmachine.nl/omeka/api/items/232',
      );
      expect(literal(result, shacl('resultSeverity'))).toEqual(
        'http://www.w3.org/ns/shacl#Warning',
      );
      expect(literal(result, shacl('sourceConstraintComponent'))).toEqual(
        'http://www.w3.org/ns/shacl#SPARQLConstraintComponent',
      );
      expect(
        [...report.errors.match(result, shacl('resultMessage'), null)].some(
          (quad) =>
            quad.object.termType === 'Literal' &&
            quad.object.language === 'en' &&
            quad.object.value === expectedMessage,
        ),
      ).toBe(true);
    }
  });

  it('SPARQL-constrained Organization checks skip Person publishers/creators', async () => {
    // Persons must pass v2.0 validation: contactPoint and identifier are promoted
    // from Warning to Violation, and Person instances legitimately lack both.
    const report = (await validate(
      'dataset-dcat-valid-minimal.jsonld',
    )) as Valid;
    expect(report.state).toEqual('valid');
    expectViolations(report, ['https://schema.org/contactPoint'], 0);
    expectViolations(report, ['https://schema.org/identifier'], 0);
  });

  it('captures full SHACL feedback for Gouda Tijdmachine fixture', async () => {
    const report = (await validate(
      'dataset-schema-org-gouda-tijdmachine.ttl',
      new StreamParser(),
    )) as Valid;

    expect(report.state).toEqual('valid');
    expect(formatReport(report)).toMatchInlineSnapshot(`
      "[Warning] https://schema.org/contactPoint on <https://www.goudatijdmachine.nl/omeka/api/items/232>: An organization must have a ContactPoint
      [Warning] https://schema.org/identifier on <https://www.goudatijdmachine.nl/omeka/api/items/232>: An organization must have one or more identifiers
      [Warning] https://schema.org/license on <https://www.goudatijdmachine.nl/omeka/api/items/3030723>: Use one of the recommended canonical license URIs
      [Warning] https://schema.org/license on <https://www.goudatijdmachine.nl/omeka/api/items/3030723>: Use the canonical Creative Commons license URI with https:// (e.g. https://creativecommons.org/publicdomain/zero/1.0/)"
    `);
  });

  it('validates PropertyValue identifier sub-constraints (propertyID, value, name)', async () => {
    // PropertyValue identifiers carry their own internal structure: propertyID
    // (must be IRI), value (must be xsd:string), name (must be string/langString
    // if present). The fixture has a PropertyValue identifier missing all three —
    // each constraint should fire as its own top-level result. String identifiers
    // would not match the SPARQL filter $this a schema:PropertyValue.
    const report = (await validate(
      'dataset-schema-org-invalid-property-value-identifier.jsonld',
    )) as Valid;
    expect(report.state).toEqual('valid');
    expectViolations(report, ['https://schema.org/propertyID']);
    expectViolations(report, ['https://schema.org/value']);
    expectViolations(report, ['https://schema.org/name']);
  });

  it('reports nested violations', async () => {
    const report = (await validate(
      'dataset-schema-org-multiple-alternate-names.ttl',
      new StreamParser(),
    )) as Valid;

    expect(report.state).toEqual('valid');

    // Once on the organization, regardless of how many predicates reference it.
    expectViolations(report, ['https://schema.org/alternateName']);

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
    // Once on the organization, independent of its creator/publisher usage.
    expectViolations(report, ['https://schema.org/sameAs']);
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
  const literal = (subject: unknown, predicate: ReturnType<typeof shacl>) =>
    [...report.errors.match(subject as never, predicate, null)][0]?.object
      .value ?? '';

  const resultNodes = [
    ...report.errors.match(null, rdfType, shacl('ValidationResult')),
  ].map((quad) => quad.subject);

  const lines = resultNodes.map((node) => {
    const severity =
      literal(node, shacl('resultSeverity')).split('#').pop() ?? '';
    const path = literal(node, shacl('resultPath'));
    const focus = literal(node, shacl('focusNode'));
    const message =
      [...report.errors.match(node, shacl('resultMessage'), null)].find(
        (quad) =>
          quad.object.termType === 'Literal' && quad.object.language === 'en',
      )?.object.value ?? '';
    return `[${severity}] ${path} on <${focus}>: ${message}`;
  });

  return lines.sort().join('\n');
};

const rdfType = rdf.namedNode(
  'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
);

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
