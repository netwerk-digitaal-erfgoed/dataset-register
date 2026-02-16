import { URL } from 'url';
import { fetch, HttpError, NoDatasetFoundAtUrl } from '../src/fetch.js';
import nock from 'nock';
import { dcat, dct, foaf, odrl, rdf } from '../src/query.js';
import factory from 'rdf-ext';
import { dereference, file, validSchemaOrgDataset } from '../src/test-utils.js';
import type { BlankNode } from '@rdfjs/types';

describe('Fetch', () => {
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
    expect(distributions).toHaveLength(3);

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

    // byteSize must be normalized in literal.ts.
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
    expect(dataset.size).toBe(6);
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
    // The Schema.org dataset should have one more triple than the DCAT equivalent due to SPARQL conformsTo
    expect(dataset.size).toEqual(dcatEquivalent.size + 1);

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

    expect(
      dataset.has(
        factory.quad(
          factory.namedNode('http://data.bibliotheken.nl/id/dataset/rise-alba'),
          dct('license'),
          factory.namedNode(
            'https://creativecommons.org/publicdomain/zero/1.0/',
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
          factory.namedNode('https://example.com'),
          foaf('mbox'),
          factory.literal('datasets@example.com'),
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

  it('handles paginated JSON-LD responses', async () => {
    nock('https://example.com')
      .get('/datasets/hydra-page1.jsonld')
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
    nock('https://example.com')
      .get('/datasets/hydra-page1.ttl')
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
});

const fetchDatasetsAsArray = async (url: URL) => {
  const datasets = [];
  for await (const dataset of fetch(url)) {
    datasets.push(dataset);
  }
  return datasets;
};
