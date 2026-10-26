import { URL } from 'url';
import {
  CouldNotFetchUrl,
  dereference as fetchDereference,
  discoverDatacatalog,
  fetch,
  createRdfFetch,
  HttpError,
  NoDatasetFoundAtUrl,
  RequestTimeout,
} from '../src/fetch.js';
import nock from 'nock';
import { dcat, dct, foaf, odrl, rdf } from '../src/query.js';
import factory from 'rdf-ext';
import { dereference, file, validSchemaOrgDataset } from '../src/test-utils.js';
import type { BlankNode, Literal, NamedNode } from '@rdfjs/types';

describe('Fetch', () => {
  it('extracts title, publisher, and identifier for a foaf:Agent publisher', async () => {
    // Regression: the dcat:Dataset branch's publisher pattern required
    // ?publisher a ?foafOrganizationOrPerson bound to foaf:Organization/foaf:Person.
    // Since that pattern is mandatory (not OPTIONAL) and shares the whole branch
    // with dct:title, a foaf:Agent-typed publisher – legitimate per DCAT-AP's
    // foaf:Agent range for dct:publisher – made the entire branch fail to bind,
    // silently dropping title, publisher, identifier, dates and creator too, not
    // just the publisher triple.
    const response = await file('dataset-dcat-valid-agent-publisher.jsonld');
    nock('https://example.com')
      .defaultReplyHeaders({ 'Content-Type': 'application/ld+json' })
      .get('/agent-publisher')
      .reply(200, response);

    const datasets = await fetchDatasetsAsArray(
      new URL('https://example.com/agent-publisher'),
    );

    expect(datasets).toHaveLength(1);
    const dataset = datasets[0];
    const datasetUri = factory.namedNode(
      'http://data.bibliotheken.nl/id/dataset/rise-alba',
    );
    const publisherUri = factory.namedNode(
      'https://example.com/dataset-provider',
    );

    expect(
      dataset.has(
        factory.quad(
          datasetUri,
          dct('title'),
          factory.literal('Alba amicorum van de Koninklijke Bibliotheek', 'nl'),
        ),
      ),
    ).toBe(true);
    expect(
      dataset.has(factory.quad(datasetUri, dct('publisher'), publisherUri)),
    ).toBe(true);
    expect(
      dataset.has(factory.quad(publisherUri, rdf('type'), foaf('Agent'))),
    ).toBe(true);
  });

  it('accepts accept valid DCAT dataset descriptions', async () => {
    const response = await file('dataset-dcat-valid.jsonld');
    nock('https://example.com')
      .defaultReplyHeaders({ 'Content-Type': 'application/ld+json' })
      .get('/valid-dcat-dataset')
      .reply(200, response);

    const datasets = await fetchDatasetsAsArray(
      new URL('https://example.com/valid-dcat-dataset'),
    );

    expect(datasets).toHaveLength(1);
    const datasetUri = factory.namedNode(
      'http://data.bibliotheken.nl/id/dataset/rise-alba',
    );
    const dataset = datasets[0];
    expect(
      dataset.has(factory.quad(datasetUri, rdf('type'), dcat('Dataset'))),
    ).toBe(true);

    const distributions = [
      ...dataset.match(datasetUri, dcat('distribution'), null),
    ];
    expect(distributions).toHaveLength(4);

    expect(
      dataset.has(
        factory.quad(
          distributions[0].object as BlankNode,
          dcat('mediaType'),
          factory.namedNode(
            'https://www.iana.org/assignments/media-types/application/rdf+xml',
          ),
        ),
      ),
    ).toBe(true);

    // byteSize must be normalized to integer bytes.
    expect(
      dataset.has(
        factory.quad(
          distributions[0].object as BlankNode,
          dcat('byteSize'),
          factory.literal(
            '12582912',
            factory.namedNode('http://www.w3.org/2001/XMLSchema#integer'),
          ),
        ),
      ),
    ).toBe(true);

    // Shorthand unit "14M" must be normalized to 14 * 1048576 = 14680064.
    expect(
      dataset.has(
        factory.quad(
          distributions[1].object as BlankNode,
          dcat('byteSize'),
          factory.literal(
            '14680064',
            factory.namedNode('http://www.w3.org/2001/XMLSchema#integer'),
          ),
        ),
      ),
    ).toBe(true);

    // Non-protocol conformsTo (application profile) must be preserved on download distributions.
    expect(
      dataset.has(
        factory.quad(
          distributions[1].object as BlankNode,
          dct('conformsTo'),
          factory.namedNode('https://docs.nde.nl/schema-profile/'),
        ),
      ),
    ).toBe(true);

    // Download distribution with non-protocol conformsTo must still have a downloadURL.
    expect(
      dataset.has(
        factory.quad(
          distributions[1].object as BlankNode,
          dcat('downloadURL'),
          factory.namedNode(
            'https://data.bibliotheken.nl/id/dataset/rise-alba.jsonld',
          ),
        ),
      ),
    ).toBe(true);

    // Existing distributions must not have compressFormat.
    for (const dist of distributions.slice(0, 3)) {
      expect([
        ...dataset.match(dist.object as BlankNode, dcat('compressFormat')),
      ]).toHaveLength(0);
    }

    // The +gzip distribution must have its mediaType stripped and compressFormat set.
    const gzipDist = distributions[3].object as BlankNode;
    expect(
      dataset.has(
        factory.quad(
          gzipDist,
          dcat('mediaType'),
          factory.namedNode(
            'https://www.iana.org/assignments/media-types/application/n-triples',
          ),
        ),
      ),
    ).toBe(true);
    expect(
      dataset.has(
        factory.quad(
          gzipDist,
          dcat('compressFormat'),
          factory.namedNode(
            'https://www.iana.org/assignments/media-types/application/gzip',
          ),
        ),
      ),
    ).toBe(true);

    // User-provided dcat:theme must be preserved.
    expect(
      dataset.has(
        factory.quad(
          datasetUri,
          dcat('theme'),
          factory.namedNode(
            'http://publications.europa.eu/resource/authority/data-theme/EDUC',
          ),
        ),
      ),
    ).toBe(true);
  });

  it('strips +zip from mediaType and sets application/zip compressFormat', async () => {
    const response = await file('dataset-dcat-valid-zip.jsonld');
    nock('https://example.com')
      .defaultReplyHeaders({ 'Content-Type': 'application/ld+json' })
      .get('/valid-dcat-dataset-zip')
      .reply(200, response);

    const datasets = await fetchDatasetsAsArray(
      new URL('https://example.com/valid-dcat-dataset-zip'),
    );

    expect(datasets).toHaveLength(1);
    const dataset = datasets[0];
    const distributions = [
      ...dataset.match(
        factory.namedNode(
          'http://data.bibliotheken.nl/id/dataset/rise-alba-zip',
        ),
        dcat('distribution'),
        null,
      ),
    ];
    expect(distributions).toHaveLength(1);
    const zipDist = distributions[0].object as BlankNode;

    expect(
      dataset.has(
        factory.quad(
          zipDist,
          dcat('mediaType'),
          factory.namedNode(
            'https://www.iana.org/assignments/media-types/application/n-triples',
          ),
        ),
      ),
    ).toBe(true);
    expect(
      dataset.has(
        factory.quad(
          zipDist,
          dcat('compressFormat'),
          factory.namedNode(
            'https://www.iana.org/assignments/media-types/application/zip',
          ),
        ),
      ),
    ).toBe(true);
  });

  it('reads a declared dcat:compressFormat and normalizes it to an IANA URI', async () => {
    const response = await file('dataset-dcat-valid-compress-format.jsonld');
    nock('https://example.com')
      .defaultReplyHeaders({ 'Content-Type': 'application/ld+json' })
      .get('/valid-dcat-dataset-compress-format')
      .reply(200, response);

    const datasets = await fetchDatasetsAsArray(
      new URL('https://example.com/valid-dcat-dataset-compress-format'),
    );

    expect(datasets).toHaveLength(1);
    const dataset = datasets[0];
    const distributions = [
      ...dataset.match(
        factory.namedNode('http://data.bibliotheken.nl/id/dataset/persons'),
        dcat('distribution'),
        null,
      ),
    ];
    expect(distributions).toHaveLength(2);

    const compressFormatOf = (distribution: BlankNode) =>
      [...dataset.match(distribution, dcat('compressFormat'))].map(
        (quad) => quad.object.value,
      );
    const mediaTypeOf = (distribution: BlankNode) =>
      [...dataset.match(distribution, dcat('mediaType'))].map(
        (quad) => quad.object.value,
      );

    // An IRI compressFormat passes through, and the media type it accompanies
    // must be left alone – it carries no +gzip suffix to strip.
    const gzipDist = distributions[0].object as BlankNode;
    expect(mediaTypeOf(gzipDist)).toEqual([
      'https://www.iana.org/assignments/media-types/application/trig',
    ]);
    expect(compressFormatOf(gzipDist)).toEqual([
      'https://www.iana.org/assignments/media-types/application/gzip',
    ]);

    // A literal compressFormat is normalized to its IANA URI, like mediaType.
    const zipDist = distributions[1].object as BlankNode;
    expect(compressFormatOf(zipDist)).toEqual([
      'https://www.iana.org/assignments/media-types/application/zip',
    ]);
  });

  // A value that is not a media type cannot become an IANA URI. Minting one
  // anyway yields an IRI with a space in it, which serializes to N-Triples that
  // the store rejects – failing the whole registration over one bad value. Drop
  // the property instead: lenient enough not to reject the dataset, strict
  // enough to keep the stored IRI valid.
  it('drops media type values that cannot become an IANA URI', async () => {
    const response = await file('dataset-dcat-invalid-media-types.jsonld');
    nock('https://example.com')
      .defaultReplyHeaders({ 'Content-Type': 'application/ld+json' })
      .get('/junk-media-types')
      .reply(200, response);

    const datasets = await fetchDatasetsAsArray(
      new URL('https://example.com/junk-media-types'),
    );

    expect(datasets).toHaveLength(1);
    const dataset = datasets[0];

    // The dataset itself must still be ingested, distributions and all.
    const distributions = [
      ...dataset.match(
        factory.namedNode('http://example.com/id/dataset/junk-media-types'),
        dcat('distribution'),
        null,
      ),
    ];
    expect(distributions).toHaveLength(3);

    // Nothing unusable is stored, under either property.
    for (const predicate of [dcat('mediaType'), dcat('compressFormat')]) {
      for (const quad of dataset.match(null, predicate, null)) {
        expect(quad.object.termType).toBe('NamedNode');
        expect(quad.object.value).not.toContain(' ');
        expect(quad.object.value).toMatch(
          /^https:\/\/www\.iana\.org\/assignments\/media-types\/[a-zA-Z]+\/|^(?!https:\/\/www\.iana\.org)/,
        );
      }
    }

    // Specifically: the three unusable values are gone, and the good one stays.
    const compressFormats = [
      ...dataset.match(null, dcat('compressFormat'), null),
    ].map((quad) => quad.object.value);
    expect(compressFormats).toEqual([]);

    const mediaTypes = [...dataset.match(null, dcat('mediaType'), null)].map(
      (quad) => quad.object.value,
    );
    expect(mediaTypes).toEqual([
      'https://www.iana.org/assignments/media-types/application/n-triples',
      'https://www.iana.org/assignments/media-types/application/n-triples',
    ]);
  });

  it('preserves ODRL policy on DCAT distributions', async () => {
    const response = await file('dataset-dcat-valid-with-policy.jsonld');
    nock('https://example.com')
      .defaultReplyHeaders({ 'Content-Type': 'application/ld+json' })
      .get('/dcat-with-policy')
      .reply(200, response);

    const datasets = await fetchDatasetsAsArray(
      new URL('https://example.com/dcat-with-policy'),
    );

    expect(datasets).toHaveLength(1);
    const dataset = datasets[0];

    // Find the distribution.
    const distributions = [
      ...dataset.match(
        factory.namedNode('http://example.com/dataset/1'),
        dcat('distribution'),
        null,
      ),
    ];
    expect(distributions).toHaveLength(1);
    const dist = distributions[0].object as BlankNode;

    // Distribution has an ODRL policy.
    const policies = [...dataset.match(dist, odrl('hasPolicy'), null)];
    expect(policies).toHaveLength(1);
    const policy = policies[0].object as BlankNode;

    // Policy type.
    expect(dataset.has(factory.quad(policy, rdf('type'), odrl('Offer')))).toBe(
      true,
    );

    // Policy profile.
    expect(
      dataset.has(
        factory.quad(
          policy,
          odrl('profile'),
          factory.namedNode('http://example.com/policy-profile'),
        ),
      ),
    ).toBe(true);

    // Permission with action, target, assignee.
    const permissions = [...dataset.match(policy, odrl('permission'), null)];
    expect(permissions).toHaveLength(1);
    const perm = permissions[0].object as BlankNode;

    expect(
      dataset.has(factory.quad(perm, rdf('type'), odrl('Permission'))),
    ).toBe(true);
    expect(dataset.has(factory.quad(perm, odrl('action'), odrl('read')))).toBe(
      true,
    );
    expect(
      dataset.has(
        factory.quad(
          perm,
          odrl('target'),
          factory.namedNode('http://example.com/dataset/1'),
        ),
      ),
    ).toBe(true);
    expect(
      dataset.has(
        factory.quad(
          perm,
          odrl('assignee'),
          factory.namedNode('http://example.com/user'),
        ),
      ),
    ).toBe(true);

    // Permission constraint.
    const permConstraints = [...dataset.match(perm, odrl('constraint'), null)];
    expect(permConstraints).toHaveLength(1);
    const permConstraint = permConstraints[0].object as BlankNode;

    expect(
      dataset.has(
        factory.quad(permConstraint, rdf('type'), odrl('Constraint')),
      ),
    ).toBe(true);
    expect(
      dataset.has(
        factory.quad(permConstraint, odrl('leftOperand'), odrl('dateTime')),
      ),
    ).toBe(true);
    expect(
      dataset.has(factory.quad(permConstraint, odrl('operator'), odrl('lt'))),
    ).toBe(true);
    expect(
      dataset.has(
        factory.quad(
          permConstraint,
          odrl('rightOperand'),
          factory.literal(
            '2025-12-31',
            factory.namedNode('http://www.w3.org/2001/XMLSchema#date'),
          ),
        ),
      ),
    ).toBe(true);

    // Permission duty.
    const duties = [...dataset.match(perm, odrl('duty'), null)];
    expect(duties).toHaveLength(1);
    const dutyNode = duties[0].object as BlankNode;

    expect(dataset.has(factory.quad(dutyNode, rdf('type'), odrl('Duty')))).toBe(
      true,
    );
    expect(
      dataset.has(factory.quad(dutyNode, odrl('action'), odrl('attribute'))),
    ).toBe(true);
    expect(
      dataset.has(
        factory.quad(
          dutyNode,
          odrl('target'),
          factory.namedNode('http://example.com/dataset/1'),
        ),
      ),
    ).toBe(true);

    // Duty constraint.
    const dutyConstraints = [
      ...dataset.match(dutyNode, odrl('constraint'), null),
    ];
    expect(dutyConstraints).toHaveLength(1);
    const dutyConstraint = dutyConstraints[0].object as BlankNode;

    expect(
      dataset.has(
        factory.quad(dutyConstraint, odrl('leftOperand'), odrl('count')),
      ),
    ).toBe(true);
    expect(
      dataset.has(factory.quad(dutyConstraint, odrl('operator'), odrl('eq'))),
    ).toBe(true);

    // Prohibition with multiple actions.
    const prohibitions = [...dataset.match(policy, odrl('prohibition'), null)];
    expect(prohibitions).toHaveLength(1);
    const prohib = prohibitions[0].object as BlankNode;

    expect(
      dataset.has(factory.quad(prohib, rdf('type'), odrl('Prohibition'))),
    ).toBe(true);
    const prohibActions = [...dataset.match(prohib, odrl('action'), null)];
    expect(prohibActions).toHaveLength(2);
    const actionValues = prohibActions.map((q) => q.object.value).sort();
    expect(actionValues).toEqual([
      'http://www.w3.org/ns/odrl/2/delete',
      'http://www.w3.org/ns/odrl/2/modify',
    ]);
    expect(
      dataset.has(
        factory.quad(
          prohib,
          odrl('target'),
          factory.namedNode('http://example.com/dataset/1'),
        ),
      ),
    ).toBe(true);
  });

  it('projects schema:about IRI to dcat:theme', async () => {
    const response = await file('dataset-schema-org-about-iri.jsonld');
    nock('https://example.com')
      .defaultReplyHeaders({ 'Content-Type': 'application/ld+json' })
      .get('/schema-org-about-iri')
      .reply(200, response);

    const datasets = await fetchDatasetsAsArray(
      new URL('https://example.com/schema-org-about-iri'),
    );

    expect(datasets).toHaveLength(1);
    const dataset = datasets[0];
    const datasetUri = factory.namedNode(
      'http://data.bibliotheken.nl/id/dataset/about-iri',
    );
    const themes = [...dataset.match(datasetUri, dcat('theme'), null)].map(
      (quad) => quad.object.value,
    );
    expect(themes).toContain('http://vocab.getty.edu/aat/300046300');
    expect(themes).toContain(
      'http://publications.europa.eu/resource/authority/data-theme/EDUC',
    );
    // schema:about IRI must survive as a NamedNode, not be coerced to a literal.
    const aatQuad = [...dataset.match(datasetUri, dcat('theme'), null)].find(
      (quad) => quad.object.value === 'http://vocab.getty.edu/aat/300046300',
    );
    expect(aatQuad?.object.termType).toEqual('NamedNode');
  });

  it('projects schema:genre IRI to dcat:theme', async () => {
    const response = await file('dataset-schema-org-genre-deprecated.jsonld');
    nock('https://example.com')
      .defaultReplyHeaders({ 'Content-Type': 'application/ld+json' })
      .get('/schema-org-genre-iri')
      .reply(200, response);

    const datasets = await fetchDatasetsAsArray(
      new URL('https://example.com/schema-org-genre-iri'),
    );

    expect(datasets).toHaveLength(1);
    const dataset = datasets[0];
    const datasetUri = factory.namedNode(
      'http://data.bibliotheken.nl/id/dataset/genre-deprecated',
    );
    const aatQuad = [...dataset.match(datasetUri, dcat('theme'), null)].find(
      (quad) => quad.object.value === 'http://vocab.getty.edu/aat/300046300',
    );
    expect(aatQuad?.object.termType).toEqual('NamedNode');
  });

  it('preserves literal schema:genre as dcat:theme literal without STR() coercion', async () => {
    const response = await file('dataset-schema-org-gouda-tijdmachine.ttl');
    nock('https://www.goudatijdmachine.nl')
      .defaultReplyHeaders({ 'Content-Type': 'text/turtle' })
      .get('/omeka/api/items/3030723')
      .reply(200, response);

    const datasets = await fetchDatasetsAsArray(
      new URL('https://www.goudatijdmachine.nl/omeka/api/items/3030723'),
    );

    expect(datasets).toHaveLength(1);
    const dataset = datasets[0];
    const datasetUri = factory.namedNode(
      'https://www.goudatijdmachine.nl/omeka/api/items/3030723',
    );
    const literalTheme = [
      ...dataset.match(datasetUri, dcat('theme'), null),
    ].find((quad) => quad.object.termType === 'Literal');
    expect(literalTheme).toBeDefined();
    expect(literalTheme?.object.value).toEqual('Historische persoonsgegevens');
    expect((literalTheme?.object as Literal).language).toEqual('nl');
  });

  it('drops URI-shaped schema:keywords from dcat:keyword output', async () => {
    const response = await file('dataset-schema-org-keyword-uri.jsonld');
    nock('http://data.bibliotheken.nl')
      .defaultReplyHeaders({ 'Content-Type': 'application/ld+json' })
      .get('/id/dataset/keyword-uri')
      .reply(200, response);

    const datasets = await fetchDatasetsAsArray(
      new URL('http://data.bibliotheken.nl/id/dataset/keyword-uri'),
    );

    expect(datasets).toHaveLength(1);
    const dataset = datasets[0];
    const datasetUri = factory.namedNode(
      'http://data.bibliotheken.nl/id/dataset/keyword-uri',
    );
    const keywordValues = [
      ...dataset.match(datasetUri, dcat('keyword'), null),
    ].map((quad) => quad.object.value);
    expect(keywordValues).toEqual(['photographs']);
  });

  it('preserves user-provided themes alongside default EDUC theme', async () => {
    const response = await file('dataset-dcat-valid-minimal.jsonld');
    const datasetWithTheme = response.replace(
      '"dct:title"',
      '"dcat:theme": {"@id": "http://publications.europa.eu/resource/authority/data-theme/TECH"}, "dct:title"',
    );
    nock('https://example.com')
      .defaultReplyHeaders({ 'Content-Type': 'application/ld+json' })
      .get('/dcat-with-theme')
      .reply(200, datasetWithTheme);

    const datasets = await fetchDatasetsAsArray(
      new URL('https://example.com/dcat-with-theme'),
    );

    expect(datasets).toHaveLength(1);
    const dataset = datasets[0];
    const datasetUri = factory.namedNode(
      'http://data.bibliotheken.nl/id/dataset/rise-alba',
    );

    const themes = [...dataset.match(datasetUri, dcat('theme'), null)].map(
      (quad) => quad.object.value,
    );
    expect(themes).toContain(
      'http://publications.europa.eu/resource/authority/data-theme/TECH',
    );
    expect(themes).toContain(
      'http://publications.europa.eu/resource/authority/data-theme/EDUC',
    );
  });

  it('preserves dct:accrualPeriodicity from DCAT input', async () => {
    const response = await file(
      'dataset-dcat-valid-accrual-periodicity.jsonld',
    );
    nock('https://example.com')
      .defaultReplyHeaders({ 'Content-Type': 'application/ld+json' })
      .get('/dcat-with-frequency')
      .reply(200, response);

    const datasets = await fetchDatasetsAsArray(
      new URL('https://example.com/dcat-with-frequency'),
    );

    expect(datasets).toHaveLength(1);
    const dataset = datasets[0];
    const datasetUri = factory.namedNode(
      'http://data.bibliotheken.nl/id/dataset/rise-alba',
    );

    expect(
      dataset.has(
        factory.quad(
          datasetUri,
          dct('accrualPeriodicity'),
          factory.namedNode(
            'http://publications.europa.eu/resource/authority/frequency/WEEKLY',
          ),
        ),
      ),
    ).toBe(true);
  });

  describe('nested DCAT nodes', () => {
    const fetchNestedNodes = async () => {
      nock('https://example.com')
        .defaultReplyHeaders({ 'Content-Type': 'application/ld+json' })
        .get('/dcat-nested-nodes')
        .reply(200, await file('dataset-dcat-valid-nested-nodes.jsonld'));
      const datasets = await fetchDatasetsAsArray(
        new URL('https://example.com/dcat-nested-nodes'),
      );
      return new Map(
        datasets.map((dataset) => [
          [...dataset.match(null, rdf('type'), dcat('Dataset'))][0].subject
            .value,
          dataset,
        ]),
      );
    };
    const publisherUri = factory.namedNode('https://example.com/id/publisher');
    const creatorUri = factory.namedNode('https://example.com/id/creator');

    it('reads dct:creator from the dataset itself', async () => {
      const datasets = await fetchNestedNodes();
      const withCreator = factory.namedNode(
        'https://example.com/id/dataset/with-creator',
      );
      const withoutCreator = factory.namedNode(
        'https://example.com/id/dataset/without-creator',
      );

      const creators = (iri: NamedNode) =>
        [...datasets.get(iri.value)!.match(iri, dct('creator'))].map(
          (quad) => quad.object.value,
        );
      expect(creators(withCreator)).toEqual([creatorUri.value]);
      expect(creators(withoutCreator)).toEqual([]);
      expect(
        datasets
          .get(withCreator.value)!
          .has(
            factory.quad(
              creatorUri,
              foaf('name'),
              factory.literal('Creator', 'en'),
            ),
          ),
      ).toBe(true);
      expect(
        datasets
          .get(withoutCreator.value)!
          .has(factory.quad(withoutCreator, dct('publisher'), publisherUri)),
      ).toBe(true);
    });

    it('keeps the start and end date of a dct:PeriodOfTime and leaves out one without', async () => {
      const datasets = await fetchNestedNodes();
      const datasetUri = factory.namedNode(
        'https://example.com/id/dataset/with-creator',
      );
      const dataset = datasets.get(datasetUri.value)!;
      const temporals = [...dataset.match(datasetUri, dct('temporal'))];
      const xsdDate = factory.namedNode(
        'http://www.w3.org/2001/XMLSchema#date',
      );

      expect(temporals).toHaveLength(1);
      const [temporal] = temporals;
      expect(temporal.object.termType).toBe('BlankNode');
      const period = temporal.object as BlankNode;
      expect(
        dataset.has(factory.quad(period, rdf('type'), dct('PeriodOfTime'))),
      ).toBe(true);
      expect(
        dataset.has(
          factory.quad(
            period,
            dcat('startDate'),
            factory.literal('1800-01-01', xsdDate),
          ),
        ),
      ).toBe(true);
      expect(
        dataset.has(
          factory.quad(
            period,
            dcat('endDate'),
            factory.literal('1900-12-31', xsdDate),
          ),
        ),
      ).toBe(true);
    });

    it('reads the media type from a dct:format literal when dcat:mediaType is absent', async () => {
      const datasets = await fetchNestedNodes();
      const dataset = datasets.get(
        'https://example.com/id/dataset/with-creator',
      )!;
      const formatLiteral = factory.namedNode(
        'https://example.com/id/distribution/format-literal',
      );

      expect(
        [...dataset.match(formatLiteral, dcat('mediaType'))].map(
          (quad) => quad.object.value,
        ),
      ).toEqual([
        'https://www.iana.org/assignments/media-types/application/n-triples',
      ]);
      expect(
        dataset.has(
          factory.quad(
            formatLiteral,
            dcat('compressFormat'),
            factory.namedNode(
              'https://www.iana.org/assignments/media-types/application/gzip',
            ),
          ),
        ),
      ).toBe(true);
    });

    it('keeps an EU file type in dct:format and prefers dcat:mediaType', async () => {
      const datasets = await fetchNestedNodes();
      const dataset = datasets.get(
        'https://example.com/id/dataset/with-creator',
      )!;
      const formatIri = factory.namedNode(
        'https://example.com/id/distribution/format-iri',
      );

      expect(
        [...dataset.match(formatIri, dcat('mediaType'))].map(
          (quad) => quad.object.value,
        ),
      ).toEqual([
        'https://www.iana.org/assignments/media-types/application/ld+json',
      ]);
      expect(
        [...dataset.match(formatIri, dct('format'))].map(
          (quad) => quad.object.value,
        ),
      ).toEqual([
        'http://publications.europa.eu/resource/authority/file-type/JSON_LD',
      ]);
    });

    it('reads the media type from dct:format when dcat:mediaType has none', async () => {
      const datasets = await fetchNestedNodes();
      const dataset = datasets.get(
        'https://example.com/id/dataset/with-creator',
      )!;
      const mediaTypes = (distribution: string) =>
        [
          ...dataset.match(factory.namedNode(distribution), dcat('mediaType')),
        ].map((quad) => quad.object.value);

      expect(
        mediaTypes('https://example.com/id/distribution/format-iana-iri'),
      ).toEqual(['https://www.iana.org/assignments/media-types/text/turtle']);
      expect(
        dataset.match(
          factory.namedNode(
            'https://example.com/id/distribution/format-iana-iri',
          ),
          dct('format'),
        ).size,
      ).toBe(0);
      expect(
        mediaTypes('https://example.com/id/distribution/invalid-media-type'),
      ).toEqual([
        'https://www.iana.org/assignments/media-types/application/n-quads',
      ]);
    });

    it('leaves out a dct:isReferencedBy blank node', async () => {
      const datasets = await fetchNestedNodes();
      const datasetUri = factory.namedNode(
        'https://example.com/id/dataset/with-creator',
      );

      expect(
        [
          ...datasets
            .get(datasetUri.value)!
            .match(datasetUri, dct('isReferencedBy')),
        ].map((quad) => quad.object.value),
      ).toEqual(['https://doi.org/10.1145/3604951.3605520']);
    });
  });

  describe('nested Schema.org nodes', () => {
    const fetchNestedNodes = async () => {
      nock('https://example.com')
        .defaultReplyHeaders({ 'Content-Type': 'application/ld+json' })
        .get('/schema-org-nested-nodes')
        .reply(200, await file('dataset-schema-org-valid-nested-nodes.jsonld'));
      const [dataset] = await fetchDatasetsAsArray(
        new URL('https://example.com/schema-org-nested-nodes'),
      );
      return dataset;
    };
    const datasetUri = factory.namedNode(
      'https://example.com/id/dataset/schema-org',
    );

    it('stores the value of a schema:PropertyValue publisher identifier, not its node', async () => {
      const dataset = await fetchNestedNodes();

      expect(
        [
          ...dataset.match(
            factory.namedNode('https://example.com/id/publisher'),
            dct('identifier'),
          ),
        ].map(({ object }) => [object.termType, object.value]),
      ).toEqual([['Literal', 'NL-HaKB']]);
    });

    it('stores a cited work by its URL and keeps a text citation', async () => {
      const dataset = await fetchNestedNodes();

      expect(
        [...dataset.match(datasetUri, dct('isReferencedBy'))]
          .map(({ object }) => [object.termType, object.value])
          .sort(),
      ).toEqual([
        ['Literal', 'A citation as text'],
        ['NamedNode', 'https://doi.org/10.1145/3604951.3605520'],
      ]);
    });
  });

  it('preserves dct:accrualPeriodicity from Schema.org input', async () => {
    const response = await file(
      'dataset-schema-org-valid-accrual-periodicity.jsonld',
    );
    nock('https://example.com')
      .defaultReplyHeaders({ 'Content-Type': 'application/ld+json' })
      .get('/schema-org-with-frequency')
      .reply(200, response);

    const datasets = await fetchDatasetsAsArray(
      new URL('https://example.com/schema-org-with-frequency'),
    );

    expect(datasets).toHaveLength(1);
    const dataset = datasets[0];
    const datasetUri = factory.namedNode(
      'http://data.bibliotheken.nl/id/dataset/rise-alba',
    );

    expect(
      dataset.has(
        factory.quad(
          datasetUri,
          dct('accrualPeriodicity'),
          factory.namedNode(
            'http://publications.europa.eu/resource/authority/frequency/DAILY',
          ),
        ),
      ),
    ).toBe(true);
  });

  it('accepts minimal valid Schema.org dataset', async () => {
    const response = await file('dataset-schema-org-valid-minimal.jsonld');
    nock('https://example.com')
      .defaultReplyHeaders({ 'Content-Type': 'application/ld+json' })
      .get('/minimal-valid-schema-org-dataset')
      .reply(200, response);

    const datasets = await fetchDatasetsAsArray(
      new URL('https://example.com/minimal-valid-schema-org-dataset'),
    );

    expect(datasets).toHaveLength(1);
    const dataset = datasets[0];
    // 7 base triples + 1 auto-assigned dcat:theme + 1 auto-derived dct:identifier
    expect(dataset.size).toBe(9);
  });

  it('accepts valid Schema.org dataset description', async () => {
    const response = await validSchemaOrgDataset();
    nock('https://example.com')
      .defaultReplyHeaders({ 'Content-Type': 'application/ld+json' })
      .get('/valid-schema-org-dataset')
      .reply(200, response);

    const datasets = await fetchDatasetsAsArray(
      new URL('https://example.com/valid-schema-org-dataset'),
    );

    expect(datasets).toHaveLength(1);
    const dataset = datasets[0];

    const dcatEquivalent = await dereference(
      'test/datasets/dataset-dcat-valid.jsonld',
    );
    // The Schema.org dataset has extra triples compared to the DCAT equivalent:
    // SPARQL conformsTo, auto-assigned accessRights, contactPoint (4 triples:
    // dcat:contactPoint, a vcard:Kind, vcard:fn, vcard:hasEmail), dcat:theme,
    // and foaf:page on the SPARQL distribution (from schema:documentation).
    // The DCAT file has a 4th gzip distribution (5 triples incl. downloadURL),
    // an extra byteSize triple, one more propagated license (4 vs 3 distributions),
    // a mediaType on the SPARQL distribution (suppressed for API distributions),
    // a dcat:theme triple (auto-assigned for Schema.org, explicit in DCAT),
    // and a foaf:mbox triple on the publisher (no longer emitted from
    // Schema.org input now that the contactPoint is the canonical email channel).
    // Fetch also replaces the `dct:temporal "..."` literal with a PeriodOfTime
    // blank node (1 → 4 quads: dct:temporal link + rdf:type + startDate + endDate).
    // Finally, the DCAT equivalent still carries one dcat:keyword quad, while the
    // Schema.org example no longer advertises keywords (they are no longer part of
    // the requirements, only echoed on the detail page when supplied) – one fewer
    // quad than the DCAT baseline.
    expect(dataset.size).toEqual(dcatEquivalent.size + 8 - 10 + 3 - 1);

    // Check that SPARQL endpoint has conformsTo triple
    const sparqlConformsToTriples = [...dataset].filter(
      (quad) =>
        quad.predicate.equals(
          factory.namedNode('http://purl.org/dc/terms/conformsTo'),
        ) &&
        quad.object.equals(
          factory.namedNode('https://www.w3.org/TR/sparql11-protocol/'),
        ),
    );
    expect(sparqlConformsToTriples).toHaveLength(1);

    // Check that non-protocol conformsTo (application profile) is preserved on download distributions
    const schemaProfileTriples = [...dataset].filter(
      (quad) =>
        quad.predicate.equals(dct('conformsTo')) &&
        quad.object.equals(
          factory.namedNode('https://docs.nde.nl/schema-profile/'),
        ),
    );
    expect(schemaProfileTriples).toHaveLength(1);

    // Verify the download distribution with the application profile still has a downloadURL
    const jsonLdDownloadUrl = [...dataset].filter(
      (quad) =>
        quad.predicate.equals(
          factory.namedNode('http://www.w3.org/ns/dcat#downloadURL'),
        ) &&
        quad.object.equals(
          factory.namedNode(
            'https://data.bibliotheken.nl/id/dataset/rise-alba.jsonld',
          ),
        ),
    );
    expect(jsonLdDownloadUrl).toHaveLength(1);

    expect(
      dataset.has(
        factory.quad(
          factory.namedNode('http://data.bibliotheken.nl/id/dataset/rise-alba'),
          dct('license'),
          factory.namedNode(
            'http://creativecommons.org/publicdomain/zero/1.0/',
          ),
        ),
      ),
    ).toBe(true);
    expect(
      dataset.has(
        factory.quad(
          factory.namedNode('http://data.bibliotheken.nl/id/dataset/rise-alba'),
          dct('created'),
          factory.literal(
            '2021-05-27',
            factory.namedNode('http://www.w3.org/2001/XMLSchema#date'),
          ),
        ),
      ),
    ).toBe(true);
    expect(
      dataset.has(
        factory.quad(
          factory.namedNode('http://data.bibliotheken.nl/id/dataset/rise-alba'),
          dct('issued'),
          factory.literal(
            '2021-05-28',
            factory.namedNode('http://www.w3.org/2001/XMLSchema#date'),
          ),
        ),
      ),
    ).toBe(true);
    expect(
      dataset.has(
        factory.quad(
          factory.namedNode('http://data.bibliotheken.nl/id/dataset/rise-alba'),
          dct('modified'),
          factory.literal(
            '2021-05-27T09:56:21.370767',
            factory.namedNode('http://www.w3.org/2001/XMLSchema#dateTime'),
          ),
        ),
      ),
    ).toBe(true);
    expect(
      dataset.has(
        factory.quad(
          factory.namedNode('http://data.bibliotheken.nl/id/dataset/rise-alba'),
          dct('publisher'),
          factory.namedNode('https://example.com'),
        ),
      ),
    ).toBe(true);
    expect(
      dataset.has(
        factory.quad(
          factory.namedNode('https://example.com'),
          rdf('type'),
          foaf('Organization'),
        ),
      ),
    ).toBe(true);
    expect(
      dataset.has(
        factory.quad(
          factory.namedNode('https://example.com/creator1'),
          rdf('type'),
          foaf('Person'),
        ),
      ),
    ).toBe(true);
    expect(
      dataset.has(
        factory.quad(
          factory.namedNode('https://example.com/creator2'),
          rdf('type'),
          foaf('Person'),
        ),
      ),
    ).toBe(true);

    const distributions = [
      ...dataset.match(
        factory.namedNode('http://data.bibliotheken.nl/id/dataset/rise-alba'),
        dcat('distribution'),
        null,
      ),
    ];
    expect(distributions).toHaveLength(3);
    expect(
      dataset.has(
        factory.quad(
          distributions[2].object as BlankNode,
          dct('conformsTo'),
          factory.namedNode('https://www.w3.org/TR/sparql11-protocol/'),
        ),
      ),
    ).toBe(true);
  });

  it('accepts valid Schema.org dataset in Turtle', async () => {
    const response = await file('dataset-schema-org-valid.ttl');
    nock('https://example.com')
      .defaultReplyHeaders({ 'Content-Type': 'text/turtle' })
      .get('/valid-schema-org-dataset.ttl')
      .reply(200, response);

    const datasets = await fetchDatasetsAsArray(
      new URL('https://example.com/valid-schema-org-dataset.ttl'),
    );

    expect(datasets).toHaveLength(1);
    const dataset = datasets[0];

    // accessURL must be converted from literal to IRI.
    const accessUrls = [
      ...dataset.match(
        // factory.quad(
        factory.namedNode('https://www.goudatijdmachine.nl/data/api/items/144'),
        dcat('accessURL'),
        undefined,
      ),
    ];
    expect(accessUrls).toHaveLength(1);
    expect(accessUrls[0].object.termType).toBe('NamedNode');
  });

  it('maps schema:name on DataDownload to dct:title on Distribution', async () => {
    const response = await file('dataset-schema-org-distribution-name.jsonld');
    nock('https://example.com')
      .defaultReplyHeaders({ 'Content-Type': 'application/ld+json' })
      .get('/distribution-name')
      .reply(200, response);

    const datasets = await fetchDatasetsAsArray(
      new URL('https://example.com/distribution-name'),
    );
    expect(datasets).toHaveLength(1);
    const dataset = datasets[0];
    const distributions = [
      ...dataset.match(
        factory.namedNode('https://example.com/dataset/distribution-name'),
        dcat('distribution'),
        null,
      ),
    ];
    expect(distributions).toHaveLength(1);

    const titleTriples = [
      ...dataset.match(
        distributions[0].object as BlankNode,
        dct('title'),
        null,
      ),
    ];
    expect(titleTriples).toHaveLength(1);
    expect((titleTriples[0].object as Literal).value).toBe('Turtle dump');
  });

  it('accepts valid HTTP Schema.org dataset in JSON-LD', async () => {
    const response = await file('dataset-http-schema-org-valid.jsonld');
    nock('https://example.com')
      .defaultReplyHeaders({ 'Content-Type': 'application/ld+json' })
      .get('/valid-schema-org-dataset')
      .reply(200, response);

    const datasets = await fetchDatasetsAsArray(
      new URL('https://example.com/valid-schema-org-dataset'),
    );

    expect(datasets).toHaveLength(1);
  });

  it('accepts valid Schema.org dataset in HTML+Microdata', async () => {
    const response = await file('dataset-schema-org-valid-microdata.html');
    nock('https://example.com')
      .defaultReplyHeaders({ 'Content-Type': 'text/html' })
      .get('/valid-schema-org-dataset-microdata')
      .reply(200, response);

    const datasets = await fetchDatasetsAsArray(
      new URL('https://example.com/valid-schema-org-dataset-microdata'),
    );

    expect(datasets).toHaveLength(1);
  });

  it('accepts valid Schema.org dataset in HTML+RDFa', async () => {
    const response = await file('dataset-schema-org-valid-rdfa.html');
    nock('https://example.com')
      .defaultReplyHeaders({ 'Content-Type': 'text/html' })
      .get('/valid-schema-org-dataset-rdfa')
      .reply(200, response);

    const datasets = await fetchDatasetsAsArray(
      new URL('https://example.com/valid-schema-org-dataset-rdfa'),
    );

    expect(datasets).toHaveLength(1);
  });

  it('accepts valid Schema.org dataset in HTML+JSON-LD', async () => {
    const response = await file('dataset-schema-org-valid-jsonld.html');
    nock('https://example.com')
      .defaultReplyHeaders({ 'Content-Type': 'text/html' })
      .get('/valid-schema-org-dataset-jsonld')
      .reply(200, response);

    const datasets = await fetchDatasetsAsArray(
      new URL('https://example.com/valid-schema-org-dataset-jsonld'),
    );

    expect(datasets).toHaveLength(1);
  });

  it('accepts valid HTTP Schema.org dataset in Turtle', async () => {
    const response = await file('dataset-http-schema-org-valid.ttl');
    nock('https://example.com')
      .defaultReplyHeaders({ 'Content-Type': 'text/turtle' })
      .get('/valid-schema-org-dataset')
      .reply(200, response);

    const datasets = await fetchDatasetsAsArray(
      new URL('https://example.com/valid-schema-org-dataset'),
    );

    expect(datasets).toHaveLength(1);
  });

  it('handles 404 error dataset response', async () => {
    nock('https://example.com').get('/404').reply(404);
    expect.assertions(2);
    try {
      await fetchDatasetsAsArray(new URL('https://example.com/404'));
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError);
      expect((e as HttpError).statusCode).toBe(404);
    }
  });

  it('handles 500 error dataset response', async () => {
    nock('https://example.com').get('/500').reply(500);
    expect.assertions(2);
    try {
      await fetchDatasetsAsArray(new URL('https://example.com/500'));
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError);
      expect((e as HttpError).statusCode).toBe(500);
    }
  });

  it('handles empty dataset response', async () => {
    nock('https://example.com').get('/200').reply(200);
    await expect(
      fetchDatasetsAsArray(new URL('https://example.com/200')),
    ).rejects.toThrow(NoDatasetFoundAtUrl);
  });

  it('surfaces the underlying fetch cause in the error message', async () => {
    const wrapped = new TypeError('fetch failed', {
      cause: new Error('redirect count exceeded'),
    });
    nock('https://example.com').get('/loop').replyWithError(wrapped);

    expect.assertions(2);
    try {
      await fetchDatasetsAsArray(new URL('https://example.com/loop'));
    } catch (e) {
      expect(e).toBeInstanceOf(CouldNotFetchUrl);
      expect((e as Error).cause).toMatch(/redirect count exceeded/);
    }
  });

  it('handles paginated JSON-LD responses', async () => {
    // First request is consumed by dereference(); second by Comunica (Hydra fallback).
    nock('https://example.com')
      .get('/datasets/hydra-page1.jsonld')
      .times(2)
      .replyWithFile(200, 'test/datasets/hydra-page1.jsonld', {
        'Content-Type': 'application/ld+json',
      });

    nock('https://example.com')
      .get('/datasets/hydra-page2.jsonld')
      .replyWithFile(200, 'test/datasets/hydra-page2.jsonld', {
        'Content-Type': 'application/ld+json',
      });

    const datasets = await fetchDatasetsAsArray(
      new URL('https://example.com/datasets/hydra-page1.jsonld'),
    );

    expect(datasets).toHaveLength(3);
  });

  it('handles paginated Turtle responses', async () => {
    // First request is consumed by dereference(); second by Comunica (Hydra fallback).
    nock('https://example.com')
      .get('/datasets/hydra-page1.ttl')
      .times(2)
      .replyWithFile(200, 'test/datasets/hydra-page1.ttl', {
        'Content-Type': 'text/turtle',
      });

    nock('https://example.com')
      .get('/datasets/hydra-page2.ttl')
      .replyWithFile(200, 'test/datasets/hydra-page2.ttl', {
        'Content-Type': 'text/turtle',
      });

    const datasets = await fetchDatasetsAsArray(
      new URL('https://example.com/datasets/hydra-page1.ttl'),
    );

    expect(datasets).toHaveLength(2);
  });

  it('propagates dataset license to distributions without their own', async () => {
    const response = await validSchemaOrgDataset();
    nock('https://example.com')
      .defaultReplyHeaders({ 'Content-Type': 'application/ld+json' })
      .get('/license-propagation')
      .reply(200, response);

    const datasets = await fetchDatasetsAsArray(
      new URL('https://example.com/license-propagation'),
    );

    const dataset = datasets[0];
    const distributionLicenses = [...dataset].filter(
      (quad) =>
        quad.predicate.equals(dct('license')) &&
        !quad.subject.equals(
          factory.namedNode('http://data.bibliotheken.nl/id/dataset/rise-alba'),
        ),
    );

    // All 3 distributions should have a license (propagated from dataset).
    expect(distributionLicenses).toHaveLength(3);
    distributionLicenses.forEach((quad) =>
      expect(quad.object.value).toBe(
        'http://creativecommons.org/publicdomain/zero/1.0/',
      ),
    );
  });

  it('denormalizes distribution license onto a DCAT dataset that has none', async () => {
    const response = await file('dataset-dcat-license-on-distribution.jsonld');
    nock('https://example.com')
      .defaultReplyHeaders({ 'Content-Type': 'application/ld+json' })
      .get('/dcat-license-on-distribution')
      .reply(200, response);

    const datasets = await fetchDatasetsAsArray(
      new URL('https://example.com/dcat-license-on-distribution'),
    );

    expect(datasets).toHaveLength(1);
    const dataset = datasets[0];
    const datasetUri = factory.namedNode(
      'http://data.bibliotheken.nl/id/dataset/license-on-distribution',
    );

    // Dataset has no own license; the distribution's CC0 is sampled onto it
    // so query consumers can find the license at the dataset level.
    const datasetLicenses = [
      ...dataset.match(datasetUri, dct('license'), null),
    ];
    expect(datasetLicenses).toHaveLength(1);
    expect(datasetLicenses[0].object.value).toBe(
      'http://creativecommons.org/publicdomain/zero/1.0/',
    );

    const distributionLicenses = [...dataset].filter(
      (quad) =>
        quad.predicate.equals(dct('license')) &&
        !quad.subject.equals(datasetUri),
    );
    expect(distributionLicenses).toHaveLength(1);
    expect(distributionLicenses[0].object.value).toBe(
      'http://creativecommons.org/publicdomain/zero/1.0/',
    );
  });

  it.each([
    [
      'https://rightsstatements.org/vocab/NoC-NC/1.0/',
      'http://rightsstatements.org/vocab/NoC-NC/1.0/',
    ],
    [
      'https://creativecommons.org/licenses/by/4.0/deed.en',
      'http://creativecommons.org/licenses/by/4.0/',
    ],
    [
      'https://creativecommons.org/publicdomain/zero/1.0',
      'http://creativecommons.org/publicdomain/zero/1.0/',
    ],
    [
      'https://creativecommons.org/licenses/by/4.0//',
      'http://creativecommons.org/licenses/by/4.0/',
    ],
    [
      'http://rightsstatements.org/vocab/InC/1.0',
      'http://rightsstatements.org/vocab/InC/1.0/',
    ],
    [
      'https://creativecommons.org/licenses/by/3.0/deed.pt_BR',
      'http://creativecommons.org/licenses/by/3.0/',
    ],
    [
      'http://creativecommons.org/publicdomain/zero/1.0/deed.nl/',
      'http://creativecommons.org/publicdomain/zero/1.0/',
    ],
    [
      'https://creativecommons.org/licenses/by/4.0/deed',
      'http://creativecommons.org/licenses/by/4.0/',
    ],
    [
      'https://creativecommons.org/licenses/by/4.0/legalcode',
      'http://creativecommons.org/licenses/by/4.0/legalcode',
    ],
    [
      'http://rightsstatements.org/page/InC/1.0/?language=nl',
      'http://rightsstatements.org/page/InC/1.0/?language=nl',
    ],
    ['https://example.org/indeed.html', 'https://example.org/indeed.html'],
    ['https://example.org/license/1.0', 'https://example.org/license/1.0'],
  ])('normalises license %s to %s', async (license, expected) => {
    const response = (await validSchemaOrgDataset()).replace(
      '"license": "http://creativecommons.org/publicdomain/zero/1.0/"',
      `"license": "${license}"`,
    );
    expect(response).toContain(license);
    nock('https://example.com')
      .defaultReplyHeaders({ 'Content-Type': 'application/ld+json' })
      .get('/normalised-license')
      .reply(200, response);

    const datasets = await fetchDatasetsAsArray(
      new URL('https://example.com/normalised-license'),
    );

    const licenses = [...datasets[0]].filter((quad) =>
      quad.predicate.equals(dct('license')),
    );
    expect(licenses).not.toHaveLength(0);
    licenses.forEach((quad) => expect(quad.object.value).toBe(expected));
  });

  it('keeps a DCAT distribution that has only a dcat:downloadURL', async () => {
    const response = await file('dataset-dcat-download-url-only.jsonld');
    nock('https://example.com')
      .defaultReplyHeaders({ 'Content-Type': 'application/ld+json' })
      .get('/dcat-download-url-only')
      .reply(200, response);

    const datasets = await fetchDatasetsAsArray(
      new URL('https://example.com/dcat-download-url-only'),
    );

    expect(datasets).toHaveLength(1);
    const dataset = datasets[0];
    const distributions = [
      ...dataset.match(
        factory.namedNode(
          'http://data.bibliotheken.nl/id/dataset/download-url-only',
        ),
        dcat('distribution'),
        null,
      ),
    ];
    expect(distributions).toHaveLength(1);

    const distribution = distributions[0].object;
    for (const property of ['accessURL', 'downloadURL']) {
      const urls = [...dataset.match(distribution, dcat(property), null)];
      expect(urls).toHaveLength(1);
      expect(urls[0].object.value).toBe('https://example.com/dataset.ttl');
    }
  });

  it('falls back per DCAT distribution when a URL is unusable', async () => {
    const response = await file(
      'dataset-dcat-distribution-url-fallbacks.jsonld',
    );
    nock('https://example.com')
      .defaultReplyHeaders({ 'Content-Type': 'application/ld+json' })
      .get('/dcat-distribution-url-fallbacks')
      .reply(200, response);

    const datasets = await fetchDatasetsAsArray(
      new URL('https://example.com/dcat-distribution-url-fallbacks'),
    );

    expect(datasets).toHaveLength(1);
    const dataset = datasets[0];
    const urls = (distributionName: string, property: string) =>
      [
        ...dataset.match(
          factory.namedNode(
            `https://example.com/distribution/${distributionName}`,
          ),
          dcat(property),
          null,
        ),
      ].map((quad) => quad.object.value);

    // A relative literal cannot become an IRI: the distribution is dropped
    // and the dataset survives.
    expect(urls('relative-download-url', 'accessURL')).toEqual([]);
    expect(
      [...dataset.match(null, dcat('distribution'), null)].map(
        (quad) => quad.object.value,
      ),
    ).not.toContain('https://example.com/distribution/relative-download-url');

    expect(urls('unusable-access-url', 'accessURL')).toEqual([
      'https://example.com/file.ttl',
    ]);

    // APIs get no dcat:downloadURL, even when that is where the URL came from.
    expect(urls('download-only-sparql', 'accessURL')).toEqual([
      'https://example.com/sparql',
    ]);
    expect(urls('download-only-sparql', 'downloadURL')).toEqual([]);
  });

  it('keeps a DCAT distribution without a license and inherits the dataset license', async () => {
    const response = await file(
      'dataset-dcat-distribution-without-license.jsonld',
    );
    nock('https://example.com')
      .defaultReplyHeaders({ 'Content-Type': 'application/ld+json' })
      .get('/dcat-distribution-without-license')
      .reply(200, response);

    const datasets = await fetchDatasetsAsArray(
      new URL('https://example.com/dcat-distribution-without-license'),
    );

    expect(datasets).toHaveLength(1);
    const dataset = datasets[0];
    const distributions = [
      ...dataset.match(
        factory.namedNode(
          'http://data.bibliotheken.nl/id/dataset/distribution-without-license',
        ),
        dcat('distribution'),
        null,
      ),
    ];
    expect(distributions).toHaveLength(1);

    const licenses = [
      ...dataset.match(distributions[0].object, dct('license'), null),
    ];
    expect(licenses).toHaveLength(1);
    expect(licenses[0].object.value).toBe(
      'http://creativecommons.org/publicdomain/zero/1.0/',
    );
  });

  it('skips a literal dct:license on a DCAT dataset and samples one from distributions', async () => {
    // KB-style data: dataset has a free-text dct:license placeholder
    // ("see distributions") and the actual license lives on the distribution.
    // The DCAT branch must not crash on the literal and must not emit it.
    // The distribution's CC0 is then sampled onto the dataset.
    const response = await file('dataset-dcat-literal-license.jsonld');
    nock('https://example.com')
      .defaultReplyHeaders({ 'Content-Type': 'application/ld+json' })
      .get('/dcat-literal-license')
      .reply(200, response);

    const datasets = await fetchDatasetsAsArray(
      new URL('https://example.com/dcat-literal-license'),
    );

    expect(datasets).toHaveLength(1);
    const dataset = datasets[0];
    const datasetUri = factory.namedNode(
      'http://data.bibliotheken.nl/id/dataset/literal-license',
    );

    const datasetLicenses = [
      ...dataset.match(datasetUri, dct('license'), null),
    ];
    expect(datasetLicenses).toHaveLength(1);
    expect(datasetLicenses[0].object.termType).toBe('NamedNode');
    expect(datasetLicenses[0].object.value).toBe(
      'http://creativecommons.org/publicdomain/zero/1.0/',
    );

    const distributionLicenses = [...dataset].filter(
      (quad) =>
        quad.predicate.equals(dct('license')) &&
        !quad.subject.equals(datasetUri),
    );
    expect(distributionLicenses).toHaveLength(1);
    expect(distributionLicenses[0].object.value).toBe(
      'http://creativecommons.org/publicdomain/zero/1.0/',
    );
  });

  it('coerces a URL-shaped literal schema:license to an indexed IRI', async () => {
    // Atlantis-style data: the export publishes schema:license as a plain
    // literal holding a URL rather than as an IRI resource. SHACL only warns
    // about it until version 2.0, so the dataset stays valid, but #1959 only indexed
    // IRI licenses, dropping the license from the index. We now coerce the
    // URL-shaped literal to its canonical IRI so dct:license stays populated.
    // https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1997
    const response = await file(
      'dataset-schema-org-literal-url-license.jsonld',
    );
    nock('https://example.com')
      .defaultReplyHeaders({ 'Content-Type': 'application/ld+json' })
      .get('/literal-url-license')
      .reply(200, response);

    const datasets = await fetchDatasetsAsArray(
      new URL('https://example.com/literal-url-license'),
    );

    expect(datasets).toHaveLength(1);
    const dataset = datasets[0];
    const datasetUri = factory.namedNode(
      'https://archief.literatuurmuseum.nl/dataset/atlantis-publiek',
    );

    const datasetLicenses = [
      ...dataset.match(datasetUri, dct('license'), null),
    ];
    expect(datasetLicenses).toHaveLength(1);
    expect(datasetLicenses[0].object.termType).toBe('NamedNode');
    expect(datasetLicenses[0].object.value).toBe(
      'http://creativecommons.org/publicdomain/zero/1.0/',
    );
  });
});

describe('discoverDatacatalog', () => {
  it('returns data when well-known datacatalog URL has valid RDF', async () => {
    const catalogContent = await file('dataset-dcat-valid-minimal.jsonld');
    nock('https://example.com')
      .defaultReplyHeaders({ 'Content-Type': 'application/ld+json' })
      .get('/.well-known/datacatalog')
      .reply(200, catalogContent);

    const result = await discoverDatacatalog(
      new URL('https://example.com/some-page'),
    );

    expect(result).not.toBeNull();
    expect(result!.url.toString()).toBe(
      'https://example.com/.well-known/datacatalog',
    );
    expect(result!.data.size).toBeGreaterThan(0);
  });

  it('returns null when well-known datacatalog URL returns 404', async () => {
    nock('https://example.com').get('/.well-known/datacatalog').reply(404);

    const result = await discoverDatacatalog(
      new URL('https://example.com/some-page'),
    );

    expect(result).toBeNull();
  });

  it('follows redirects to a valid catalog', async () => {
    const catalogContent = await file('dataset-dcat-valid-minimal.jsonld');
    nock('https://example.com')
      .get('/.well-known/datacatalog')
      .reply(302, '', { Location: 'https://example.com/catalog.jsonld' });
    nock('https://example.com')
      .defaultReplyHeaders({ 'Content-Type': 'application/ld+json' })
      .get('/catalog.jsonld')
      .reply(200, catalogContent);

    const result = await discoverDatacatalog(
      new URL('https://example.com/some-page'),
    );

    expect(result).not.toBeNull();
    expect(result!.data.size).toBeGreaterThan(0);
  });

  it('returns null when well-known datacatalog URL has invalid content', async () => {
    nock('https://example.com')
      .get('/.well-known/datacatalog')
      .reply(200, 'This is not valid RDF', {
        'Content-Type': 'text/plain',
      });

    const result = await discoverDatacatalog(
      new URL('https://example.com/some-page'),
    );

    expect(result).toBeNull();
  });
});

describe('dereference media type', () => {
  it('reports the media type the registration was served as', async () => {
    nock('https://example.com')
      .defaultReplyHeaders({ 'Content-Type': 'text/turtle' })
      .get('/dataset.ttl')
      .replyWithFile(200, 'test/datasets/dataset-http-schema-org-valid.ttl');

    const { mediaType } = await fetchDereference(
      new URL('https://example.com/dataset.ttl'),
    );

    expect(mediaType).toEqual('text/turtle');
  });

  it('reports the media type for JSON-LD as well', async () => {
    const response = await file('dataset-schema-org-valid-minimal.jsonld');
    nock('https://example.com')
      .defaultReplyHeaders({ 'Content-Type': 'application/ld+json' })
      .get('/dataset.jsonld')
      .reply(200, response);

    const { mediaType } = await fetchDereference(
      new URL('https://example.com/dataset.jsonld'),
    );

    expect(mediaType).toEqual('application/ld+json');
  });

  it('falls back to the URL extension when the response declares no media type', async () => {
    // A missing Content-Type reaches us as the empty string, not undefined. Comunica still
    // parses the body by mapping the .ttl extension, so reporting the declared type alone
    // would record a Turtle file as unknown.
    nock('https://example.com')
      .get('/dataset.ttl')
      .replyWithFile(200, 'test/datasets/dataset-http-schema-org-valid.ttl');

    const { mediaType } = await fetchDereference(
      new URL('https://example.com/dataset.ttl'),
    );

    expect(mediaType).toEqual('text/turtle');
  });

  it('falls back to the URL extension when the response declares text/plain', async () => {
    // Comunica maps text/plain and application/octet-stream to “no media type”, so these
    // take the extension path as well – a very common way for hosts to serve .ttl files.
    nock('https://example.com')
      .defaultReplyHeaders({ 'Content-Type': 'text/plain' })
      .get('/dataset.ttl')
      .replyWithFile(200, 'test/datasets/dataset-http-schema-org-valid.ttl');

    const { mediaType } = await fetchDereference(
      new URL('https://example.com/dataset.ttl'),
    );

    expect(mediaType).toEqual('text/turtle');
  });

  it('carries the unrecognized media type on the thrown error', async () => {
    nock('https://example.com')
      .defaultReplyHeaders({ 'Content-Type': 'image/jpeg' })
      .get('/photo')
      .reply(200, '');

    await expect(
      fetchDereference(new URL('https://example.com/photo')),
    ).rejects.toMatchObject({ mediaType: 'image/jpeg' });
  });
});

describe('CONSTRUCT query cross-product', () => {
  it('does not produce excessive duplicate quads for catalogs with a shared publisher', async () => {
    const response = await file('catalog-schema-org-valid.jsonld');
    nock('https://example.com')
      .defaultReplyHeaders({ 'Content-Type': 'application/ld+json' })
      .get('/catalog')
      .reply(200, response);

    const { data } = await fetchDereference(
      new URL('https://example.com/catalog'),
    );
    const datasets = [];
    for await (const dataset of fetch(
      new URL('https://example.com/catalog'),
      data,
    )) {
      datasets.push(dataset);
    }

    expect(datasets).toHaveLength(2);
    const totalQuads = datasets.reduce((sum, d) => sum + d.size, 0);
    // With 2 datasets, expect roughly 20–40 unique quads.
    // A cross-product bug would produce hundreds or thousands.
    expect(totalQuads).toBeLessThan(100);
  });
});

describe('Language tag defaults', () => {
  it('adds default language tag to untagged literals', async () => {
    const response = await file('dataset-dcat-valid-no-lang-tag.jsonld');
    nock('https://example.com')
      .defaultReplyHeaders({ 'Content-Type': 'application/ld+json' })
      .get('/no-lang-tag')
      .reply(200, response);

    const datasets = await fetchDatasetsAsArray(
      new URL('https://example.com/no-lang-tag'),
    );

    expect(datasets).toHaveLength(1);
    const dataset = datasets[0];

    const titles = [...dataset.match(null, dct('title'), null)];
    expect(titles).toHaveLength(1);
    expect(titles[0].object.value).toBe(
      'Alba amicorum van de Koninklijke Bibliotheek',
    );
    expect((titles[0].object as Literal).language).toBe('nl');

    const names = [...dataset.match(null, foaf('name'), null)];
    expect(names).toHaveLength(1);
    expect((names[0].object as Literal).language).toBe('nl');
  });

  it('preserves existing language tags', async () => {
    const response = await file('dataset-dcat-valid.jsonld');
    nock('https://example.com')
      .defaultReplyHeaders({ 'Content-Type': 'application/ld+json' })
      .get('/with-lang-tag')
      .reply(200, response);

    const datasets = await fetchDatasetsAsArray(
      new URL('https://example.com/with-lang-tag'),
    );

    expect(datasets).toHaveLength(1);
    const dataset = datasets[0];

    const titles = [...dataset.match(null, dct('title'), null)];
    expect(titles.length).toBeGreaterThan(0);
    // Existing language tags should be preserved, not overwritten with 'nl'.
    for (const title of titles) {
      expect((title.object as Literal).language).not.toBe('');
    }
  });
});

describe('Request timeout', () => {
  // A distinct host keeps the aborted, poisoned connection out of the example.com
  // pool the other tests reuse. The afterEach cancels nock's delayed-response timer
  // (left pending by the abort) so it cannot fire during a later test.
  afterEach(() => {
    nock.abortPendingRequests();
    nock.cleanAll();
  });

  it('aborts a dereference whose host stalls past the request timeout', async () => {
    const response = await validSchemaOrgDataset();
    nock('https://slow.example')
      .defaultReplyHeaders({ 'Content-Type': 'application/ld+json' })
      .get('/stalls')
      .delayConnection(500) // Far longer than the 20 ms timeout below.
      .reply(200, response);

    // A 20 ms per-request timeout must abort the stalled fetch instead of waiting,
    // so one trickling host can never freeze the crawl loop (issue #2000). The abort
    // must surface as a RequestTimeout (a distinct, retry-worthy outcome) rather than
    // being misclassified as NoDatasetFoundAtUrl.
    await expect(
      fetchDereference(new URL('https://slow.example/stalls'), 20),
    ).rejects.toThrow(RequestTimeout);
  });

  it('applies the request timeout to every page of a paginated catalogue', async () => {
    // Page 1 is dereferenced; Comunica then follows the Hydra link to page 2. Passing an
    // explicit per-request timeout to fetch() must reach the page-2 GET too, proving
    // pages 2..N are bounded by the same deadline – not just the first dereference (#2000).
    nock('https://slow.example')
      .get('/datasets/hydra-page1.jsonld')
      .times(2)
      .replyWithFile(200, 'test/datasets/hydra-page1.jsonld', {
        'Content-Type': 'application/ld+json',
      });
    nock('https://slow.example')
      .get('/datasets/hydra-page2.jsonld')
      .replyWithFile(200, 'test/datasets/hydra-page2.jsonld', {
        'Content-Type': 'application/ld+json',
      });

    const { data } = await fetchDereference(
      new URL('https://slow.example/datasets/hydra-page1.jsonld'),
    );
    const datasets = [];
    for await (const dataset of fetch(
      new URL('https://slow.example/datasets/hydra-page1.jsonld'),
      data,
      5000,
    )) {
      datasets.push(dataset);
    }

    expect(datasets).toHaveLength(3);
  });

  it('merges a caller-supplied abort signal with the timeout', async () => {
    nock('https://slow.example')
      .get('/merge')
      .delayConnection(500)
      .reply(200, 'never delivered');

    // The timeout is generous, so the caller's own signal must still abort the
    // request – proving the timeout signal is merged with, not substituted for, it.
    const controller = new AbortController();
    const timedFetch = createRdfFetch(10_000);
    const pending = timedFetch('https://slow.example/merge', {
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toThrow();
  });
});

const fetchDatasetsAsArray = async (url: URL) => {
  const { data } = await fetchDereference(url);
  const datasets = [];
  for await (const dataset of fetch(url, data)) {
    datasets.push(dataset);
  }
  return datasets;
};
