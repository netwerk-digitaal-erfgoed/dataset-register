import {URL} from 'url';
import {fetch, HttpError, NoDatasetFoundAtUrl} from '../src/fetch';
import nock from 'nock';
import {dcat, dct, foaf, rdf} from '../src/query';
import factory from 'rdf-ext';
import {file} from './mock';
import {BlankNode} from 'rdf-js';

describe('Fetch', () => {
  it('must accept valid DCAT dataset descriptions', async () => {
    const response = await file('dataset-dcat-valid.jsonld');
    nock('https://example.com')
      .defaultReplyHeaders({'Content-Type': 'application/ld+json'})
      .get('/valid-dcat-dataset')
      .reply(200, response);

    const datasets = await fetch(
      new URL('https://example.com/valid-dcat-dataset')
    );

    expect(datasets).toHaveLength(1);
    const datasetUri = factory.namedNode(
      'http://data.bibliotheken.nl/id/dataset/rise-alba'
    );
    const dataset = datasets[0];
    expect(
      dataset.has(
        factory.quad(datasetUri, rdf('type'), dcat('Dataset'), datasetUri)
      )
    ).toBe(true);

    const distributions = [
      ...dataset.match(datasetUri, dcat('distribution'), null, datasetUri),
    ];
    expect(distributions).toHaveLength(1);

    // dcat:
    expect(
      dataset.has(
        factory.quad(
          distributions[0].object as BlankNode,
          dcat('mediaType'),
          factory.literal('application/rdf+xml'),
          datasetUri
        )
      )
    ).toBe(true);
  });

  it('accepts minimal valid Schema.org dataset', async () => {
    const response = await file('dataset-schema-org-valid-minimal.jsonld');
    nock('https://example.com')
      .defaultReplyHeaders({'Content-Type': 'application/ld+json'})
      .get('/minimal-valid-schema-org-dataset')
      .reply(200, response);

    const datasets = await fetch(
      new URL('https://example.com/minimal-valid-schema-org-dataset')
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

    const datasets = await fetch(
      new URL('https://example.com/valid-schema-org-dataset')
    );

    expect(datasets).toHaveLength(1);
    const dataset = datasets[0];
    expect(dataset.size).toBe(25);
    expect(
      dataset.has(
        factory.quad(
          factory.namedNode('http://data.bibliotheken.nl/id/dataset/rise-alba'),
          dct('license'),
          factory.namedNode(
            'http://creativecommons.org/publicdomain/zero/1.0/'
          ),
          factory.namedNode('http://data.bibliotheken.nl/id/dataset/rise-alba')
        )
      )
    ).toBe(true);
    expect(
      dataset.has(
        factory.quad(
          factory.namedNode('http://data.bibliotheken.nl/id/dataset/rise-alba'),
          dct('publisher'),
          factory.namedNode('https://example.com/publisher'),
          factory.namedNode('http://data.bibliotheken.nl/id/dataset/rise-alba')
        )
      )
    ).toBe(true);
    expect(
      dataset.has(
        factory.quad(
          factory.namedNode('https://example.com/publisher'),
          rdf('type'),
          foaf('Organization'),
          factory.namedNode('http://data.bibliotheken.nl/id/dataset/rise-alba')
        )
      )
    ).toBe(true);
    expect(
      dataset.has(
        factory.quad(
          factory.namedNode('https://example.com/creator1'),
          rdf('type'),
          foaf('Person'),
          factory.namedNode('http://data.bibliotheken.nl/id/dataset/rise-alba')
        )
      )
    ).toBe(true);
    expect([
      ...dataset.match(
        factory.namedNode('http://data.bibliotheken.nl/id/dataset/rise-alba'),
        dcat('distribution'),
        null,
        factory.namedNode('http://data.bibliotheken.nl/id/dataset/rise-alba')
      ),
    ]).toHaveLength(2);
  });

  it('accepts valid Schema.org dataset in Turtle', async () => {
    const response = await file('dataset-schema-org-valid.ttl');
    nock('https://example.com')
      .defaultReplyHeaders({'Content-Type': 'text/turtle'})
      .get('/valid-schema-org-dataset')
      .reply(200, response);

    const datasets = await fetch(
      new URL('https://example.com/valid-schema-org-dataset')
    );

    expect(datasets).toHaveLength(1);
  });

  it('accepts valid HTTP Schema.org dataset in JSON-LD', async () => {
    const response = await file('dataset-http-schema-org-valid.jsonld');
    nock('https://example.com')
      .defaultReplyHeaders({'Content-Type': 'application/ld+json'})
      .get('/valid-schema-org-dataset')
      .reply(200, response);

    const datasets = await fetch(
      new URL('https://example.com/valid-schema-org-dataset')
    );

    expect(datasets).toHaveLength(1);
  });

  it('accepts valid HTTP Schema.org dataset in Turtle', async () => {
    const response = await file('dataset-http-schema-org-valid.ttl');
    nock('https://example.com')
      .defaultReplyHeaders({'Content-Type': 'text/turtle'})
      .get('/valid-schema-org-dataset')
      .reply(200, response);

    const datasets = await fetch(
      new URL('https://example.com/valid-schema-org-dataset')
    );

    expect(datasets).toHaveLength(1);
  });

  it('handles 404 error dataset response', async () => {
    nock('https://example.com').get('/404').reply(404);
    expect.assertions(2);
    try {
      await fetch(new URL('https://example.com/404'));
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError);
      expect((e as HttpError).statusCode).toBe(404);
    }
  });

  it('handles 500 error dataset response', async () => {
    nock('https://example.com').get('/500').reply(500);
    expect.assertions(2);
    try {
      await fetch(new URL('https://example.com/500'));
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError);
      expect((e as HttpError).statusCode).toBe(500);
    }
  });

  it('handles empty dataset response', async () => {
    nock('https://example.com').get('/200').reply(200);
    expect.assertions(1);
    try {
      await fetch(new URL('https://example.com/200'));
    } catch (e) {
      expect(e).toBeInstanceOf(NoDatasetFoundAtUrl);
    }
  });
});
