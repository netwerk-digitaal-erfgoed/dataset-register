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
    nock('https://example.com').head('/registered-url').reply(404);

    const registration = new Registration(
      new URL('https://example.com/registered-url'),
      new Date()
    );
    registration.read(
      [new URL('https://example.com/dataset1')],
      200,
      new Date('2000-01-01')
    );
    registrationStore.store(registration);

    await crawler.crawl(new Date('3000-01-01'));

    const readRegistration = registrationStore.all()[0];
    expect(readRegistration.statusCode).toBe(404);
    expect(readRegistration.datasets).toEqual([]); // Any datasets previously read at the URL are emptied.
  });
});
