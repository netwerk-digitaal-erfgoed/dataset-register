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
    vi.restoreAllMocks();
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

  it('logs per-phase timing for slow registrations and a round summary', async () => {
    // Advance the clock 10s on every performance.now() call so each registration crosses the slow
    // threshold without waiting; the spy is restored in afterEach.
    let clock = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => (clock += 10_000));

    const logged: Array<{ fields: Record<string, unknown>; message: string }> =
      [];
    const capturingLogger = {
      info: (fields: Record<string, unknown>, message: string) =>
        logged.push({ fields, message }),
      warn: () => undefined,
    } as unknown as pino.Logger;

    // A validator that fills the timing sink the way CompositeValidator does, so the SHACL /
    // probe-network / store-write split is asserted to reach the log line.
    const timingValidator: Validator = {
      validate: (_input, _onProgress, timing) => {
        if (timing) {
          timing.shaclMs = 5;
          timing.networkMs = 900;
          timing.storeWriteMs = 3_600_000;
          timing.endpointsProbed = 100;
          timing.endpointsSkippedBeyondCap = 190;
          timing.endpointsFailed = 11;
        }
        return Promise.resolve({ state: 'valid', errors: new Store() });
      },
    };
    crawler = new Crawler(
      registrationStore,
      new MockDatasetStore(),
      new MockRatingStore(),
      reportStore,
      timingValidator,
      capturingLogger,
    );

    // Two registrations so the round summary sorts more than one entry.
    await storeRegistrationFixture(new URL('https://example.com/valid'));
    await storeRegistrationFixture(new URL('https://example.com/valid2'));
    const response = await validSchemaOrgDataset();
    nock('https://example.com')
      .defaultReplyHeaders({ 'Content-Type': 'application/ld+json' })
      .get('/valid')
      .times(2)
      .reply(200, response)
      .get('/valid2')
      .times(2)
      .reply(200, response);

    await crawler.crawl(new Date('3000-01-01'));

    const timingLine = logged.find(
      (line) => line.fields.event === 'crawl.registration.timing',
    );
    if (!timingLine) {
      throw new Error('expected a crawl.registration.timing log line');
    }
    expect(timingLine.fields).toMatchObject({
      probeNetworkMs: 900,
      probeStoreWriteMs: 3_600_000,
      endpointsProbed: 100,
      endpointsSkippedBeyondCap: 190,
      endpointsFailed: 11,
    });
    expect(timingLine.fields.url).toMatch(/example\.com\/valid/);
    expect(timingLine.fields.totalMs).toBeGreaterThanOrEqual(5000);

    const summaryLine = logged.find(
      (line) => line.fields.event === 'crawl.round.summary',
    );
    if (!summaryLine) {
      throw new Error('expected a crawl.round.summary log line');
    }
    expect(summaryLine.fields.registrations).toBe(2);
    const slowest = summaryLine.fields.slowest as Array<{
      url: string;
      totalMs: number;
    }>;
    expect(slowest).toHaveLength(2);
    // Sorted descending by duration.
    expect(slowest[0].totalMs).toBeGreaterThanOrEqual(slowest[1].totalMs);
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
