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

    for (const [result, expectedSeverity, expectedMessage] of [
      [
        contactPointResult,
        'http://www.w3.org/ns/shacl#Warning',
        'Add a contact point with a name and email address, preferably of the department that manages the dataset or catalogue',
      ],
      [
        identifierResult,
        'http://www.w3.org/ns/shacl#Info',
        'Add an identifier for the organisation, such as a Chamber of Commerce number or ISIL',
      ],
    ] as const) {
      expect(literal(result, shacl('focusNode'))).toEqual(
        'https://www.goudatijdmachine.nl/omeka/api/items/232',
      );
      expect(literal(result, shacl('resultSeverity'))).toEqual(
        expectedSeverity,
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
    // Person instances legitimately lack contactPoint and identifier, so the
    // Organization-targeted SPARQL shapes must not fire against them — including
    // when contactPoint is promoted to Violation at v2.0.
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
      "[Info] https://schema.org/about on <https://www.goudatijdmachine.nl/omeka/api/items/3030723>: Add a URI describing the dataset’s subject matter or material type (for example from the Network of Terms)
      [Info] https://schema.org/identifier on <https://www.goudatijdmachine.nl/omeka/api/items/232>: Add an identifier for the organisation, such as a Chamber of Commerce number or ISIL
      [Warning] https://schema.org/contactPoint on <https://www.goudatijdmachine.nl/omeka/api/items/232>: Add a contact point with a name and email address, preferably of the department that manages the dataset or catalogue
      [Warning] https://schema.org/encodingFormat on <https://www.goudatijdmachine.nl/omeka/api/items/3030722>: Remove the SPARQL MIME type from schema:encodingFormat; SPARQL endpoints are declared via schema:usageInfo
      [Warning] https://schema.org/genre on <https://www.goudatijdmachine.nl/omeka/api/items/3030723>: schema:genre is deprecated; use schema:about with a URI (for example from the Network of Terms)
      [Warning] https://schema.org/license on <https://www.goudatijdmachine.nl/omeka/api/items/3030723>: Use https:// (not http://) in the Creative Commons license URL
      [Warning] https://schema.org/license on <https://www.goudatijdmachine.nl/omeka/api/items/3030723>: Use one of the Creative Commons licenses, such as https://creativecommons.org/publicdomain/zero/1.0/ (CC0) or https://creativecommons.org/licenses/by/4.0/ (CC BY 4.0)
      [Warning] https://schema.org/temporalCoverage on <https://www.goudatijdmachine.nl/omeka/api/items/3030723>: Use an ISO 8601 date or time interval (such as ‘2011/2012’, ‘-0431/-0404’ for BCE, or ‘1440/..’) or a web URI
      [Warning] https://schema.org/usageInfo on <https://www.goudatijdmachine.nl/omeka/api/items/3030722>: Add the SPARQL protocol URI (https://www.w3.org/TR/sparql11-protocol/) to schema:usageInfo for SPARQL endpoints"
    `);
  });

  it('accepts ISO 8601 shortened-end temporal coverage notation', async () => {
    const report = (await validate(
      'dataset-schema-org-temporal-shortened.jsonld',
    )) as Valid;
    expect(report.state).toEqual('valid');
    const temporalResults = report.errors.match(
      null,
      shacl('resultPath'),
      rdf.namedNode('https://schema.org/temporalCoverage'),
    );
    expect(temporalResults.size).toEqual(0);
  });

  it('warns that schema:genre is deprecated', async () => {
    const report = (await validate(
      'dataset-schema-org-genre-deprecated.jsonld',
    )) as Valid;
    expect(report.state).toEqual('valid');
    const genreResults = [
      ...report.errors.match(
        null,
        shacl('resultPath'),
        rdf.namedNode('https://schema.org/genre'),
      ),
    ].map((quad) => quad.subject);
    expect(genreResults).toHaveLength(1);
    const [genreResult] = genreResults;
    expect(
      [...report.errors.match(genreResult, shacl('resultSeverity'), null)][0]
        ?.object.value,
    ).toEqual('http://www.w3.org/ns/shacl#Warning');
    const messages = [
      ...report.errors.match(genreResult, shacl('resultMessage'), null),
    ]
      .filter(
        (quad) =>
          quad.object.termType === 'Literal' && quad.object.language === 'en',
      )
      .map((quad) => quad.object.value);
    expect(messages).toContain(
      'schema:genre is deprecated; use schema:about with a URI (for example from the Network of Terms)',
    );
  });

  it('accepts schema:about with a SKOS concept URI without warnings', async () => {
    const report = (await validate(
      'dataset-schema-org-about-iri.jsonld',
    )) as Valid;
    expect(report.state).toEqual('valid');
    expectViolations(report, ['https://schema.org/about'], 0);
    expectViolations(report, ['https://schema.org/genre'], 0);
  });

  it('rejects schema:about as a literal with two specific violation messages', async () => {
    const stringAboutFixture = (await file(
      'dataset-schema-org-about-iri.jsonld',
    )) as string;
    const literalAboutJson = stringAboutFixture.replace(
      '"about": { "@id": "http://vocab.getty.edu/aat/300046300" }',
      '"about": "photographs"',
    );
    const input = (await rdf
      .dataset()
      .import(
        Readable.from(literalAboutJson).pipe(
          new JsonLdParser() as unknown as Transform,
        ),
      )) as unknown as Dataset;
    const report = (await validator.validate(input)) as InvalidDataset;
    expect(report.state).toEqual('invalid');
    // Split shapes: nodeKind and pattern each fire as their own violation with
    // a specific message.
    expectViolations(report, ['https://schema.org/about'], 2);
    const aboutResults = [
      ...report.errors.match(
        null,
        shacl('resultPath'),
        rdf.namedNode('https://schema.org/about'),
      ),
    ].map((quad) => quad.subject);
    for (const result of aboutResults) {
      expect(
        [...report.errors.match(result, shacl('resultSeverity'), null)][0]
          ?.object.value,
      ).toEqual('http://www.w3.org/ns/shacl#Violation');
    }
  });

  it('warns when schema:keywords contains an http(s) URI', async () => {
    const report = (await validate(
      'dataset-schema-org-keyword-uri.jsonld',
    )) as Valid;
    expect(report.state).toEqual('valid');
    const keywordResults = [
      ...report.errors.match(
        null,
        shacl('resultPath'),
        rdf.namedNode('https://schema.org/keywords'),
      ),
    ].map((quad) => quad.subject);
    expect(keywordResults).toHaveLength(1);
    const [keywordResult] = keywordResults;
    expect(
      [...report.errors.match(keywordResult, shacl('resultSeverity'), null)][0]
        ?.object.value,
    ).toEqual('http://www.w3.org/ns/shacl#Warning');
    const messages = [
      ...report.errors.match(keywordResult, shacl('resultMessage'), null),
    ]
      .filter(
        (quad) =>
          quad.object.termType === 'Literal' && quad.object.language === 'en',
      )
      .map((quad) => quad.object.value);
    expect(messages).toContain(
      'Use schema:about for URIs describing the subject matter',
    );
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

  it('reports split date and IRI failures with specific messages, not generic sh:node fallback', async () => {
    // Regression: a previous refactor moved the datatype/pattern checks into
    // reusable NodeShapes referenced via sh:node, which caused shacl-engine to
    // emit the generic "Value does not have shape …" message. The checks must
    // be inlined as separate property shapes so each carries its own sh:message.
    const report = (await validate(
      'dataset-schema-org-invalid-date-and-iri.ttl',
      new StreamParser(),
    )) as Valid;

    const messagesFor = (path: string) =>
      [...report.errors.match(null, shacl('resultPath'), rdf.namedNode(path))]
        .map((quad) => quad.subject)
        .flatMap((resultNode) => [
          ...report.errors.match(
            resultNode as never,
            shacl('resultMessage'),
            null,
          ),
        ])
        .filter(
          (quad) =>
            quad.object.termType === 'Literal' && quad.object.language === 'en',
        )
        .map((quad) => quad.object.value)
        .sort();

    // datePublished "not-a-date": wrong datatype AND wrong format
    expect(messagesFor('https://schema.org/datePublished')).toEqual([
      'Use a value of type xsd:date, xsd:dateTime, schema:Date or schema:DateTime',
      'Use an ISO 8601 date, such as 2026-04-14 or 2026-04-14T10:30:00',
    ]);

    // dateModified "2024-01-15": plain string literal (wrong datatype) but
    // lexical form matches the ISO pattern — exactly one message expected.
    expect(messagesFor('https://schema.org/dateModified')).toEqual([
      'Use a value of type xsd:date, xsd:dateTime, schema:Date or schema:DateTime',
    ]);

    // spatialCoverage "Netherlands": not an IRI and does not start with http(s)
    expect(messagesFor('https://schema.org/spatialCoverage')).toEqual([
      'Use a value of type URI (RDF resource), not text',
      'Use a web URI starting with http:// or https://',
    ]);

    // includedInDataCatalog "ftp://…": literal with non-http(s) scheme
    expect(messagesFor('https://schema.org/includedInDataCatalog')).toEqual([
      'Use a value of type URI (RDF resource), not text',
      'Use a web URI starting with http:// or https://',
    ]);

    // No generic sh:node fallback leaked through.
    const allMessages = [
      ...report.errors.match(null, shacl('resultMessage'), null),
    ].map((quad) => quad.object.value);
    expect(allMessages).not.toContain('Value does not have shape');
    expect(
      allMessages.some((message) =>
        message.startsWith('Value does not have shape'),
      ),
    ).toBe(false);
  });

  it('reports multiple publishers with a max-count message, not the min-count message', async () => {
    // Regression: min-count and max-count on schema:publisher previously shared
    // a single sh:message ("Add a publisher"), so a dataset with two publishers
    // returned a misleading result message. Each failure mode must carry its
    // own message.
    const report = (await validate(
      'dataset-schema-org-multiple-publishers.jsonld',
    )) as InvalidDataset;

    expect(report.state).toBe('invalid');

    const publisherMessages = [
      ...report.errors.match(
        null,
        shacl('resultPath'),
        rdf.namedNode('https://schema.org/publisher'),
      ),
    ]
      .map((quad) => quad.subject)
      .flatMap((resultNode) => [
        ...report.errors.match(
          resultNode as never,
          shacl('resultMessage'),
          null,
        ),
      ])
      .filter(
        (quad) =>
          quad.object.termType === 'Literal' && quad.object.language === 'en',
      )
      .map((quad) => quad.object.value);

    expect(publisherMessages).toContain('Use at most one publisher');
    expect(publisherMessages).not.toContain('Add a publisher');
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

  it('flags non-https mainEntityOfPage on a distribution', async () => {
    const jsonld = JSON.stringify({
      '@context': 'https://schema.org/',
      '@type': 'Dataset',
      '@id': 'https://example.com/dataset/distribution-landing-page',
      name: 'Dataset with distribution landing page',
      license: 'https://creativecommons.org/publicdomain/zero/1.0/',
      publisher: {
        '@type': 'Organization',
        '@id': 'https://example.com/publisher',
        name: 'Example Publisher',
      },
      distribution: [
        {
          '@type': 'DataDownload',
          encodingFormat: 'text/turtle',
          contentUrl: 'https://example.com/dataset.ttl',
          mainEntityOfPage: 'http://example.com/dataset/landing',
        },
      ],
    });
    const input = (await rdf
      .dataset()
      .import(
        Readable.from(jsonld).pipe(new JsonLdParser() as unknown as Transform),
      )) as unknown as Dataset;
    const report = (await validator.validate(input)) as InvalidDataset;
    expect(report.state).toEqual('invalid');
    expectViolations(report, ['https://schema.org/mainEntityOfPage']);
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

  it('emits uniqueLang violation once per focus node, not once per shape', async () => {
    // Regression: Organization and Person shapes both targeted objects of
    // dct:publisher and dct:creator with identical foaf:name constraints, so
    // every uniqueLang violation fired twice on the same focus node.
    const report = (await validate(
      'dataset-dcat-organization-person-duplicate-shapes.jsonld',
    )) as Valid;
    const foafName = rdf.namedNode('http://xmlns.com/foaf/0.1/name');
    const uniqueLangResults = [
      ...report.errors.match(null, shacl('resultPath'), foafName),
    ]
      .map((quad) => quad.subject)
      .filter(
        (resultNode) =>
          [
            ...report.errors.match(
              resultNode as never,
              shacl('sourceConstraintComponent'),
              shacl('UniqueLangConstraintComponent'),
            ),
          ].length > 0,
      );
    expect(uniqueLangResults).toHaveLength(1);
  });

  it('does not emit spurious foaf:name violations when publisher equals creator', async () => {
    const report = (await validate(
      'dataset-dcat-publisher-equals-creator.jsonld',
    )) as Valid;
    const foafName = rdf.namedNode('http://xmlns.com/foaf/0.1/name');
    const foafNameResults = [
      ...report.errors.match(null, shacl('resultPath'), foafName),
    ];
    expect(foafNameResults).toHaveLength(0);
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
