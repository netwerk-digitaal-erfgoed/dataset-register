import { Registration, Validator } from '@dataset-register/core';
import { Crawler } from '../src/crawler.js';
import { URL } from 'url';
import {
  file,
  MockDatasetStore,
  MockRatingStore,
  MockRegistrationStore,
  MockValidationReportStore,
  validSchemaOrgDataset,
} from '@dataset-register/core/test-utils';
import nock from 'nock';
import pino from 'pino';
import { DataFactory, Store } from 'n3';

const SHACL = 'http://www.w3.org/ns/shacl#';
const reportWithWarnings = (count: number) => {
  const { quad, blankNode, namedNode } = DataFactory;
  return new Store(
    Array.from({ length: count }, (_unused, index) =>
      quad(
        blankNode(`result${index}`),
        namedNode(`${SHACL}resultSeverity`),
        namedNode(`${SHACL}Warning`),
      ),
    ),
  );
};

let registrationStore: MockRegistrationStore;
let reportStore: MockValidationReportStore;
let crawler: Crawler;
const validator = (isValid: boolean, errors = new Store()): Validator => ({
  validate: () =>
    Promise.resolve({
      state: isValid ? 'valid' : 'invalid',
      errors: errors,
    }),
});
const noDatasetValidator: Validator = {
  validate: () => Promise.resolve({ state: 'no-dataset' }),
};

describe('Crawler', () => {
  beforeEach(async () => {
    registrationStore = new MockRegistrationStore();
    reportStore = new MockValidationReportStore();
    crawler = new Crawler(
      registrationStore,
      new MockDatasetStore(),
      new MockRatingStore(),
      reportStore,
      validator(true),
      pino({ enabled: false }),
    );
  });

  afterEach(() => {
    // The timeout test aborts a stalled request, leaving nock's delayed-response
    // timer pending; cancel it so it cannot fire during a later test.
    nock.abortPendingRequests();
    nock.cleanAll();
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

  it('marks registration gone when URL no longer serves a dataset', async () => {
    await storeRegistrationFixture(
      new URL('https://example.com/no-more-datasets'),
    );

    nock('https://example.com')
      .get('/no-more-datasets')
      .reply(200, 'no datasets');
    await crawler.crawl(new Date('3000-01-01'));

    const readRegistration = registrationStore.all()[0];
    expect(readRegistration.statusCode).toBeUndefined();
    expect(readRegistration.registrationStatus).toBe('gone');
    expect(readRegistration.datasets).toHaveLength(1); // Any references to datasets are kept.
  });

  it('records the warning count and stores the validation report', async () => {
    crawler = new Crawler(
      registrationStore,
      new MockDatasetStore(),
      new MockRatingStore(),
      reportStore,
      validator(true, reportWithWarnings(2)),
      pino({ enabled: false }),
    );
    await storeRegistrationFixture(new URL('https://example.com/valid'));

    const response = await validSchemaOrgDataset();
    nock('https://example.com')
      .defaultReplyHeaders({ 'Content-Type': 'application/ld+json' })
      .get('/valid')
      .times(2)
      .reply(200, response);
    await crawler.crawl(new Date('3000-01-01'));

    const readRegistration = registrationStore.all()[0];
    expect(readRegistration.warningCount).toBe(2);
    expect(
      reportStore.reports.get('https://example.com/valid'),
    ).toBeDefined();
  });

  it('logs URLs that no longer validate', async () => {
    crawler = new Crawler(
      registrationStore,
      new MockDatasetStore(),
      new MockRatingStore(),
      reportStore,
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
    expect(readRegistration.registrationStatus).toBe('invalid');
  });

  it('marks registration gone when validator finds no datasets', async () => {
    crawler = new Crawler(
      registrationStore,
      new MockDatasetStore(),
      new MockRatingStore(),
      reportStore,
      noDatasetValidator,
      pino({ enabled: false }),
    );
    await storeRegistrationFixture(new URL('https://example.com/no-dataset'));

    nock('https://example.com')
      .defaultReplyHeaders({ 'Content-Type': 'application/ld+json' })
      .get('/no-dataset')
      .reply(200);
    await crawler.crawl(new Date('3000-01-01'));

    const readRegistration = registrationStore.all()[0];
    expect(readRegistration.statusCode).toBeUndefined();
    expect(readRegistration.registrationStatus).toBe('gone');
  });

  it('leaves a registration untouched when a request times out', async () => {
    // A 20 ms timeout proves the configured value is threaded through to dereference:
    // a host that stalls past it must abort, and the registration must be left for the
    // next pass (not recorded as gone), so a transiently slow host is retried.
    crawler = new Crawler(
      registrationStore,
      new MockDatasetStore(),
      new MockRatingStore(),
      reportStore,
      validator(true),
      pino({ enabled: false }),
      { httpRequestTimeoutMs: 20 },
    );
    await storeRegistrationFixture(new URL('https://slow.example/stalls'));

    const response = await validSchemaOrgDataset();
    nock('https://slow.example')
      .defaultReplyHeaders({ 'Content-Type': 'application/ld+json' })
      .get('/stalls')
      .delayConnection(500) // Far longer than the 20 ms timeout.
      .reply(200, response);
    await crawler.crawl(new Date('3000-01-01'));

    // The registration is untouched: its original 2000-01-01 dateRead still stands,
    // so the next pass retries it instead of recording a bogus crawl result.
    const readRegistration = registrationStore.all()[0];
    expect(readRegistration.dateRead).toEqual(new Date('2000-01-01'));
  });

  it('marks registration gone when content type is unrecognized', async () => {
    await storeRegistrationFixture(new URL('https://example.com/wrong-type'));

    // image/jpeg trips rdf-dereferencer's "Unrecognized media type" path,
    // which surfaces as InvalidContentType – neither HttpError nor
    // NoDatasetFoundAtUrl, so it exercises the catch-all warn log.
    nock('https://example.com')
      .defaultReplyHeaders({ 'Content-Type': 'image/jpeg' })
      .get('/wrong-type')
      .reply(200, '');
    await crawler.crawl(new Date('3000-01-01'));

    const readRegistration = registrationStore.all()[0];
    expect(readRegistration.statusCode).toBeUndefined();
    expect(readRegistration.registrationStatus).toBe('gone');
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
