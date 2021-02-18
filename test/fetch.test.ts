import {URL} from 'url';
import {fetch} from '../src/fetch';
import nock from 'nock';
import fs from 'fs';

describe('Fetch', () => {
  it('must accept valid dataset descriptions', async () => {
    const response = await file('dataset-schema-org-valid.jsonld');
    // console.log(response);
    nock('https://example2.com')
      .defaultReplyHeaders({'Content-Type': 'application/ld+json'})
      .head('/valid-dataset')
      .reply(200)
      .get('/valid-dataset')
      .reply(200, response);

    const datasets = await fetch(new URL('https://example2.com/valid-dataset'));
    expect(datasets).toHaveLength(1);

    nock.restore();
  });
});

const file = async (filename: string) =>
  await fs.promises.readFile(`test/datasets/${filename}`, 'utf-8');
