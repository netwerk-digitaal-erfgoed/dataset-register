import {URL} from 'url';
import {fetch, HttpError, NoDatasetFoundAtUrl} from '../src/fetch';
import nock from 'nock';
import fs from 'fs';
import {dcat, dct, rdf} from '../src/query';
import factory from 'rdf-ext';

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
    const dataset = datasets[0];
    expect(
      dataset.includes(
        factory.quad(
          factory.namedNode('http://data.bibliotheken.nl/id/dataset/rise-alba'),
          rdf('type'),
          dcat('Dataset'),
          factory.namedNode('http://data.bibliotheken.nl/id/dataset/rise-alba')
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
    expect(dataset.size).toBe(8);
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
    expect(dataset.size).toBe(19);
    expect(
      dataset.includes(
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
      dataset.includes(
        factory.quad(
          factory.namedNode('http://data.bibliotheken.nl/id/dataset/rise-alba'),
          dct('publisher'),
          factory.namedNode('https://example.com/publisher'),
          factory.namedNode('http://data.bibliotheken.nl/id/dataset/rise-alba')
        )
      )
    ).toBe(true);
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

const file = async (filename: string) =>
  await fs.promises.readFile(`test/datasets/${filename}`, 'utf-8');
