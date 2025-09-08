import {URL} from 'url';
import {fetch, HttpError, NoDatasetFoundAtUrl} from '../src/fetch.js';
import nock from 'nock';
import {dcat, dct, foaf, rdf} from '../src/query.js';
import factory from 'rdf-ext';
import { dereference, file } from '../src/test-utils.js';
import type {BlankNode} from '@rdfjs/types';

describe('Fetch', () => {
  it('accepts accept valid DCAT dataset descriptions', async () => {
    const response = await file('dataset-dcat-valid.jsonld');
    nock('https://example.com')
      .defaultReplyHeaders({'Content-Type': 'application/ld+json'})
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
          factory.literal('application/rdf+xml'),
        ),
      ),
    ).toBe(true);
  });

  it('accepts minimal valid Schema.org dataset', async () => {
    const response = await file('dataset-schema-org-valid-minimal.jsonld');
    nock('https://example.com')
      .defaultReplyHeaders({'Content-Type': 'application/ld+json'})
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
    const response = await file('dataset-schema-org-valid.jsonld');
    nock('https://example.com')
      .defaultReplyHeaders({'Content-Type': 'application/ld+json'})
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
    const sparqlConformsToTriples = [...dataset].filter(quad =>
      quad.predicate.equals(factory.namedNode('http://purl.org/dc/terms/conformsTo')) &&
      quad.object.equals(factory.namedNode('https://www.w3.org/TR/sparql11-protocol/'))
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
          factory.namedNode('https://example.com/publisher'),
        ),
      ),
    ).toBe(true);
    expect(
      dataset.has(
        factory.quad(
          factory.namedNode('https://example.com/publisher'),
          rdf('type'),
          foaf('Organization'),
        ),
      ),
    ).toBe(true);
    expect(
      dataset.has(
        factory.quad(
          factory.namedNode('https://example.com/publisher'),
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
      .defaultReplyHeaders({'Content-Type': 'text/turtle'})
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
      .defaultReplyHeaders({'Content-Type': 'application/ld+json'})
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
      .defaultReplyHeaders({'Content-Type': 'text/turtle'})
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
