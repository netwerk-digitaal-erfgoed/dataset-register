import { Registration, Validator } from '@dataset-register/core';
import { Crawler } from '../src/crawler.js';
import { URL } from 'url';
import {
  file,
  MockDatasetStore,
  MockRatingStore,
  MockRegistrationStore,
  validSchemaOrgDataset,
} from '@dataset-register/core/test-utils';
import nock from 'nock';
import pino from 'pino';
import { Store } from 'n3';

let registrationStore: MockRegistrationStore;
let crawler: Crawler;
const validator = (isValid: boolean, errors = new Store()): Validator => ({
  validate: () =>
    Promise.resolve({
      state: isValid ? 'valid' : 'invalid',
      errors: errors,
    }),
});

describe('Crawler', () => {
  beforeEach(async () => {
    registrationStore = new MockRegistrationStore();
    crawler = new Crawler(
      registrationStore,
      new MockDatasetStore(),
      new MockRatingStore(),
      validator(true),
      pino({ enabled: false }),
    );
  });

  it('crawls valid URLs', async () => {
    await storeRegistrationFixture(new URL('https://example.com/valid'));

    const response = await validSchemaOrgDataset();
    nock('https://example.com')
      .defaultReplyHeaders({ 'Content-Type': 'application/ld+json' })
      .get('/valid')
      .times(2)
      .reply(200, response);
    await crawler.crawl(new Date('3000-01-01'));

    const readRegistration = registrationStore.all()[0];
    expect(readRegistration.statusCode).toBe(200);
    expect(readRegistration.datasets).toEqual([
      new URL('http://data.bibliotheken.nl/id/dataset/rise-alba'),
    ]);
  });

  it('crawls valid URL with minimal description', async () => {
    await storeRegistrationFixture(new URL('https://example.com/minimal'));

    const response = await file('dataset-schema-org-valid-minimal.jsonld');
    nock('https://example.com')
      .defaultReplyHeaders({ 'Content-Type': 'application/ld+json' })
      .get('/minimal')
      .times(2)
      .reply(200, response);
    await crawler.crawl(new Date('3000-01-01'));

    const readRegistration = registrationStore.all()[0];
    expect(readRegistration.statusCode).toBe(200);
    expect(readRegistration.datasets).toEqual([
      new URL('http://data.bibliotheken.nl/id/dataset/rise-alba'),
    ]);
  });

  it('stores error HTTP response status code', async () => {
    await storeRegistrationFixture(
      new URL('https://example.com/registered-url'),
    );

    nock('https://example.com').get('/registered-url').reply(404);
    await crawler.crawl(new Date('3000-01-01'));

    const readRegistration = registrationStore.all()[0];
    expect(readRegistration.statusCode).toBe(404);
    expect(readRegistration.datasets).toHaveLength(1); // Any references to datasets are kept.
  });

  it('ignores datasets no longer available', async () => {
    await storeRegistrationFixture(
      new URL('https://example.com/no-more-datasets'),
    );

    nock('https://example.com')
      .get('/no-more-datasets')
      .reply(200, 'no datasets');
    await crawler.crawl(new Date('3000-01-01'));

    const readRegistration = registrationStore.all()[0];
    expect(readRegistration.statusCode).toBe(200);
    expect(readRegistration.datasets).toHaveLength(1); // Any references to datasets are kept.
  });

  it('logs URLs that no longer validate', async () => {
    crawler = new Crawler(
      registrationStore,
      new MockDatasetStore(),
      new MockRatingStore(),
      validator(false),
      pino({ enabled: false }),
    );
    await storeRegistrationFixture(new URL('https://example.com/invalid'));

    nock('https://example.com')
      .defaultReplyHeaders({ 'Content-Type': 'application/ld+json' })
      .get('/invalid')
      .reply(200);
    await crawler.crawl(new Date('3000-01-01'));

    const readRegistration = registrationStore.all()[0];
    expect(readRegistration.validUntil).not.toBeUndefined();
  });
});

async function storeRegistrationFixture(url: URL) {
  const registration = new Registration(url, new Date());
  const updatedRegistration = registration.read(
    [new URL('https://example.com/dataset1')],
    200,
    true,
    new Date('2000-01-01'),
  );
  await registrationStore.store(updatedRegistration);
}
