import {Registration} from '../src/registration';
import {Crawler} from '../src/crawler';
import {URL} from 'url';
import {file, MockDatasetStore, MockRegistrationStore} from './mock';
import nock from 'nock';
import Pino from 'pino';
import {Validator} from '../src/validator';
import factory from 'rdf-ext';

let registrationStore: MockRegistrationStore;
let crawler: Crawler;
const validator = (isValid: boolean): Validator => ({
  validate: () =>
    Promise.resolve({
      state: isValid ? 'valid' : 'invalid',
      errors: factory.dataset(),
    }),
});

describe('Crawler', () => {
  beforeEach(async () => {
    registrationStore = new MockRegistrationStore();
    crawler = new Crawler(
      registrationStore,
      new MockDatasetStore(),
      validator(true),
      Pino({enabled: false})
    );
  });

  it('crawls valid URLs', async () => {
    storeRegistrationFixture(new URL('https://example.com/valid'));

    const response = await file('dataset-schema-org-valid.jsonld');
    nock('https://example.com')
      .defaultReplyHeaders({'Content-Type': 'application/ld+json'})
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

  it('stores error HTTP response status code', async () => {
    storeRegistrationFixture(new URL('https://example.com/registered-url'));

    nock('https://example.com').get('/registered-url').reply(404);
    await crawler.crawl(new Date('3000-01-01'));

    const readRegistration = registrationStore.all()[0];
    expect(readRegistration.statusCode).toBe(404);
    expect(readRegistration.datasets).toEqual([]); // Any datasets previously read at the URL are emptied.
  });

  it('ignores datasets no longer available', async () => {
    storeRegistrationFixture(new URL('https://example.com/no-more-datasets'));

    nock('https://example.com')
      .get('/no-more-datasets')
      .reply(200, 'no datasets');
    await crawler.crawl(new Date('3000-01-01'));

    const readRegistration = registrationStore.all()[0];
    expect(readRegistration.statusCode).toBe(200);
    expect(readRegistration.datasets).toEqual([]); // Any datasets previously read at the URL are emptied.
  });

  it('logs URLs that no longer validate', async () => {
    crawler = new Crawler(
      registrationStore,
      new MockDatasetStore(),
      validator(false),
      Pino({enabled: false})
    );
    storeRegistrationFixture(new URL('https://example.com/invalid'));

    nock('https://example.com')
      .defaultReplyHeaders({'Content-Type': 'application/ld+json'})
      .get('/invalid')
      .reply(200);
    await crawler.crawl(new Date('3000-01-01'));

    const readRegistration = registrationStore.all()[0];
    expect(readRegistration.validUntil).not.toBeUndefined();
  });
});

function storeRegistrationFixture(url: URL) {
  const registration = new Registration(url, new Date());
  registration.read(
    [new URL('https://example.com/dataset1')],
    200,
    true,
    new Date('2000-01-01')
  );
  registrationStore.store(registration);
}
