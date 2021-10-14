import {URL} from 'url';
import {fetch} from '../src/fetch';
import nock from 'nock';
import fs from 'fs';
import {dcat, dct, rdf} from '../src/query';
import factory from 'rdf-ext';

describe('Fetch', () => {
  it('must accept valid DCAT dataset descriptions', async () => {
    const response = await file('dataset-dcat-valid.jsonld');
    nock('https://example.com')
      .defaultReplyHeaders({'Content-Type': 'application/ld+json'})
      .head('/valid-dcat-dataset')
      .reply(200)
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

  it('must accept valid Schema.org dataset descriptions', async () => {
    const response = await file('dataset-schema-org-valid.jsonld');
    nock('https://example.com')
      .defaultReplyHeaders({'Content-Type': 'application/ld+json'})
      .head('/valid-schema-org-dataset')
      .reply(200)
      .get('/valid-schema-org-dataset')
      .reply(200, response);

    const datasets = await fetch(
      new URL('https://example.com/valid-schema-org-dataset')
    );

    expect(datasets).toHaveLength(1);
    const dataset = datasets[0];
    expect(dataset.size).toBe(22);
    expect(
      dataset.includes(
        factory.quad(
          factory.namedNode('http://data.bibliotheken.nl/id/dataset/rise-alba'),
          dcat('keyword'),
          factory.literal('alba amicorum'),
          factory.namedNode('http://data.bibliotheken.nl/id/dataset/rise-alba')
        )
      )
    ).toBe(true);
    expect(
      dataset.includes(
        factory.quad(
          factory.namedNode('http://data.bibliotheken.nl/id/dataset/rise-alba'),
          dct('creator'),
          factory.namedNode('https://example.com/creator'),
          factory.namedNode('http://data.bibliotheken.nl/id/dataset/rise-alba')
        )
      )
    ).toBe(true);
  });
});

const file = async (filename: string) =>
  await fs.promises.readFile(`test/datasets/${filename}`, 'utf-8');
