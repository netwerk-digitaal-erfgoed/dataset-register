import {Registration} from '../src/registration';
import {Crawler} from '../src/crawler';
import {URL} from 'url';
import {MockDatasetStore, MockRegistrationStore} from './mock';
import nock from 'nock';
import Pino from 'pino';

let registrationStore: MockRegistrationStore;
let crawler: Crawler;

describe('Crawler', () => {
  beforeEach(async () => {
    registrationStore = new MockRegistrationStore();
    crawler = new Crawler(
      registrationStore,
      new MockDatasetStore(),
      Pino({enabled: false})
    );
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
});

function storeRegistrationFixture(url: URL) {
  const registration = new Registration(url, new Date());
  registration.read(
    [new URL('https://example.com/dataset1')],
    200,
    new Date('2000-01-01')
  );
  registrationStore.store(registration);
}
