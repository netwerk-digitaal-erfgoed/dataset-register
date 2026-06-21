import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { QLeverContainer } from './qlever-container.js';
import {
  SparqlAllowedRegistrationDomainStore,
  SparqlClient,
  SparqlDatasetStore,
  SparqlRatingStore,
  SparqlRegistrationStore,
  SparqlValidationReportStore,
  stores,
} from '../src/sparql.js';
import { SparqlDistributionHealthStore } from '../src/distribution-health-store.js';
import { SparqlDistributionValidityStore } from '../src/distribution-validity-store.js';
import { distributionValidityQuads } from '../src/distribution-validity.js';
import { validationReportGraphIri } from '../src/validation-report.js';
import { shacl } from '../src/validator.js';
import factory from 'rdf-ext';
import {
  createTestDataset,
  createTestDatasetWithPublisher,
  createTestRegistration,
  TEST_DATASET_IRIS,
  TEST_PUBLISHER_IRIS,
} from './fixtures/test-datasets.js';
import { dereference } from '../src/test-utils.js';
import { Penalty, Rating } from '../src/index.js';

const registrationsGraphIri = 'http://example.org/registrations';
const allowedDomainsGraphIri = 'http://example.org/allowed-domains';
const ratingsGraphIri = 'http://example.org/ratings';
const distributionHealthGraphIri = 'http://example.org/distribution-health';
const distributionValidityGraphIri = 'http://example.org/distribution-validity';

describe('SPARQL', () => {
  let qleverContainer: QLeverContainer;
  let sparqlClient: SparqlClient;
  let registrationStore: SparqlRegistrationStore;
  let datasetStore: SparqlDatasetStore;
  let allowedRegistrationDomainStore: SparqlAllowedRegistrationDomainStore;
  let ratingStore: SparqlRatingStore;
  let distributionHealthStore: SparqlDistributionHealthStore;
  let distributionValidityStore: SparqlDistributionValidityStore;
  let validationReportStore: SparqlValidationReportStore;

  beforeAll(async () => {
    qleverContainer = new QLeverContainer();
    const sparqlEndpoint = await qleverContainer.start();
    sparqlClient = new SparqlClient(
      sparqlEndpoint,
      qleverContainer.accessToken,
    );
    ({
      datasetStore,
      registrationStore,
      allowedRegistrationDomainStore,
      ratingStore,
      distributionHealthStore,
      distributionValidityStore,
      validationReportStore,
    } = stores(
      sparqlEndpoint,
      qleverContainer.accessToken,
      registrationsGraphIri,
      allowedDomainsGraphIri,
      ratingsGraphIri,
      distributionHealthGraphIri,
      distributionValidityGraphIri,
    ));
  }, 20_000);

  afterAll(async () => {
    await qleverContainer.stop();
  });

  beforeEach(async () => {
    await qleverContainer.clearData();
  });

  describe('SparqlValidationReportStore', () => {
    const warningResult = (id: string) =>
      factory.quad(
        factory.blankNode(id),
        shacl('resultSeverity'),
        shacl('Warning'),
      );

    const countTriples = async (graph: string) => {
      const result = await sparqlClient.query(`
        SELECT (COUNT(?s) AS ?count) WHERE { GRAPH <${graph}> { ?s ?p ?o } }
      `);
      return parseInt((await result.toArray())[0]!.get('count')!.value, 10);
    };

    it('stores a report in the registration graph and replaces it on re-store', async () => {
      const registrationUrl = new URL('https://example.com/registration');
      const graph = validationReportGraphIri(registrationUrl).toString();

      await validationReportStore.store(
        registrationUrl,
        factory.dataset([warningResult('r1'), warningResult('r2')]),
      );
      expect(await countTriples(graph)).toBe(2);

      // Re-storing replaces the graph rather than appending to it.
      await validationReportStore.store(
        registrationUrl,
        factory.dataset([warningResult('r3')]),
      );
      expect(await countTriples(graph)).toBe(1);
    });

    it('deletes a registration’s report graph', async () => {
      const registrationUrl = new URL('https://example.com/registration');
      const graph = validationReportGraphIri(registrationUrl).toString();

      await validationReportStore.store(
        registrationUrl,
        factory.dataset([warningResult('r1')]),
      );
      await validationReportStore.delete(registrationUrl);

      expect(await countTriples(graph)).toBe(0);
    });
  });

  describe('SparqlDatasetStore', () => {
    it('should store a dataset', async () => {
      const dataset = await dereference(
        'test/datasets/dataset-dcat-valid.jsonld',
      );
      await datasetStore.store(dataset);

      const result = await sparqlClient.query(`
        PREFIX dcat: <http://www.w3.org/ns/dcat#>
        PREFIX dct: <http://purl.org/dc/terms/>
        
        SELECT ?dataset ?title WHERE {
          ?dataset a dcat:Dataset ;
            dct:title ?title .
        }
      `);

      const bindings = await result.toArray();
      expect(bindings).toHaveLength(2);
      expect(bindings[0]?.get('dataset')?.value).toBe(
        'http://data.bibliotheken.nl/id/dataset/rise-alba',
      );
      expect(bindings[0]?.get('title')?.value).toBe(
        'Alba amicorum of the Dutch Royal Library',
      );
    });

    it('should replace existing dataset when storing the same IRI', async () => {
      const dataset1 = createTestDataset(
        TEST_DATASET_IRIS.DATASET_1,
        'Original Title',
      );
      await datasetStore.store(dataset1);

      const dataset2 = createTestDataset(
        TEST_DATASET_IRIS.DATASET_1,
        'Updated Title',
      );
      await datasetStore.store(dataset2);

      const result = await sparqlClient.query(`
        PREFIX dcat: <http://www.w3.org/ns/dcat#>
        PREFIX dct: <http://purl.org/dc/terms/>
        
        SELECT ?title WHERE {
          <${TEST_DATASET_IRIS.DATASET_1}> a dcat:Dataset ;
            dct:title ?title .
        }
      `);

      const bindings = await result.toArray();
      expect(bindings).toHaveLength(1);
      expect(bindings[0]?.get('title')?.value).toBe('Updated Title');
    });

    it('should count datasets correctly', async () => {
      expect(await datasetStore.countDatasets()).toBe(0);

      await datasetStore.store(createTestDataset(TEST_DATASET_IRIS.DATASET_1));
      await datasetStore.store(createTestDataset(TEST_DATASET_IRIS.DATASET_2));
      await datasetStore.store(createTestDataset(TEST_DATASET_IRIS.DATASET_3));

      expect(await datasetStore.countDatasets()).toBe(3);
    });

    it('should count organizations correctly', async () => {
      expect(await datasetStore.countOrganisations()).toBe(0);

      await datasetStore.store(
        createTestDatasetWithPublisher(
          TEST_DATASET_IRIS.DATASET_1,
          TEST_PUBLISHER_IRIS.PUBLISHER_1,
          'Publisher 1',
        ),
      );
      await datasetStore.store(
        createTestDatasetWithPublisher(
          TEST_DATASET_IRIS.DATASET_2,
          TEST_PUBLISHER_IRIS.PUBLISHER_2,
          'Publisher 2',
        ),
      );

      // Store another dataset with same publisher as first
      await datasetStore.store(
        createTestDatasetWithPublisher(
          TEST_DATASET_IRIS.DATASET_3,
          TEST_PUBLISHER_IRIS.PUBLISHER_1,
          'Publisher 1',
        ),
      );

      expect(await datasetStore.countOrganisations()).toBe(2);
    });

    it('should delete a dataset', async () => {
      await datasetStore.store(createTestDataset(TEST_DATASET_IRIS.DATASET_1));
      expect(await datasetStore.countDatasets()).toBe(1);

      await datasetStore.delete(new URL(TEST_DATASET_IRIS.DATASET_1));
      expect(await datasetStore.countDatasets()).toBe(0);
    });
  });

  describe('SparqlRegistrationStore', () => {
    it('should store a registration', async () => {
      const registration = createTestRegistration(
        'https://example.org/dataset1.json',
        new Date('2025-01-01T10:00:00Z'),
        new Date('2025-12-31T23:59:59Z'),
        new Date('2025-01-15T08:30:00Z'),
        [
          new URL(TEST_DATASET_IRIS.DATASET_1),
          new URL(TEST_DATASET_IRIS.DATASET_2),
        ],
      );
      await registrationStore.store(registration);

      const result = await sparqlClient.query(`
        PREFIX schema: <https://schema.org/>
        
        SELECT * WHERE {
          GRAPH <${registrationsGraphIri}> {
            ?s a schema:EntryPoint ;
              schema:datePosted ?datePosted ;
              schema:validUntil ?validUntil ;
              schema:dateRead ?dateRead .
          }
        }
      `);

      const bindings = await result.toArray();
      expect(bindings).toHaveLength(1);
      expect(bindings[0]?.get('s')?.value).toBe(
        'https://example.org/dataset1.json',
      );
      expect(new Date(bindings[0]!.get('datePosted')!.value)).toEqual(
        new Date('2025-01-01T10:00:00Z'),
      );
      expect(new Date(bindings[0]!.get('validUntil')!.value)).toEqual(
        new Date('2025-12-31T23:59:59Z'),
      );
      expect(new Date(bindings[0]!.get('dateRead')!.value)).toEqual(
        new Date('2025-01-15T08:30:00Z'),
      );
    });

    it('should find registrations read before a specific date', async () => {
      const registration1 = createTestRegistration(
        'https://example.org/registration1.json',
        new Date('2025-01-01T10:00:00Z'),
        new Date('2025-01-10T08:00:00Z'),
        new Date('2025-01-10T08:00:00Z'), // Old read date
      );

      const registration2 = createTestRegistration(
        'https://example.org/registration2.json',
        new Date('2025-01-02T10:00:00Z'),
        undefined,
        new Date('2025-01-20T08:00:00Z'), // Recent read date
      );

      await registrationStore.store(registration1);
      await registrationStore.store(registration2);

      const veryOldRegistrations =
        await registrationStore.findRegistrationsReadBefore(
          new Date('1900-01-01'),
        );
      expect(veryOldRegistrations).toHaveLength(0);
      const oldRegistrations =
        await registrationStore.findRegistrationsReadBefore(
          new Date('2025-01-15T00:00:00Z'),
        );
      expect(oldRegistrations).toHaveLength(1);

      const urls = oldRegistrations.map((r) => r.url.toString());
      expect(urls).toContain('https://example.org/registration1.json');
      expect(urls).not.toContain('https://example.org/registration2.json');

      expect(oldRegistrations[0].validUntil).toEqual(
        new Date('2025-01-10T08:00:00Z'),
      );
    });

    it('should find a registration by URL', async () => {
      const registration = createTestRegistration(
        'https://example.org/dataset1.json',
        new Date('2025-01-01T10:00:00Z'),
        new Date('2025-12-31T23:59:59Z'),
        new Date('2025-01-15T08:30:00Z'),
      );
      await registrationStore.store(registration);

      const found = await registrationStore.findByUrl(
        new URL('https://example.org/dataset1.json'),
      );

      expect(found).toBeDefined();
      expect(found!.url.toString()).toBe('https://example.org/dataset1.json');
      expect(found!.datePosted).toEqual(new Date('2025-01-01T10:00:00Z'));
      expect(found!.validUntil).toEqual(new Date('2025-12-31T23:59:59Z'));
    });

    it('should find a registration with its datasets', async () => {
      const datasets = [
        new URL('https://example.org/dataset/1'),
        new URL('https://example.org/dataset/2'),
      ];
      const registration = createTestRegistration(
        'https://example.org/with-datasets.json',
        new Date('2025-01-01T10:00:00Z'),
        undefined,
        new Date('2025-01-15T08:30:00Z'),
        datasets,
      );
      await registrationStore.store(registration);

      const found = await registrationStore.findByUrl(
        new URL('https://example.org/with-datasets.json'),
      );

      expect(found).toBeDefined();
      expect(found!.datasets).toHaveLength(2);
      expect(found!.datasets.map((d) => d.toString())).toContain(
        'https://example.org/dataset/1',
      );
      expect(found!.datasets.map((d) => d.toString())).toContain(
        'https://example.org/dataset/2',
      );
    });

    it('should return undefined for non-existent URL', async () => {
      const found = await registrationStore.findByUrl(
        new URL('https://example.org/nonexistent.json'),
      );

      expect(found).toBeUndefined();
    });

    it('should delete a registration and its linked datasets', async () => {
      const datasets = [
        new URL('https://example.org/dataset/1'),
        new URL('https://example.org/dataset/2'),
      ];
      const registration = createTestRegistration(
        'https://example.org/to-delete.json',
        new Date('2025-01-01T10:00:00Z'),
        undefined,
        new Date('2025-01-15T08:30:00Z'),
        datasets,
      );
      await registrationStore.store(registration);

      // Verify it exists
      const found = await registrationStore.findByUrl(
        new URL('https://example.org/to-delete.json'),
      );
      expect(found).toBeDefined();

      // Delete
      await registrationStore.delete(
        new URL('https://example.org/to-delete.json'),
      );

      // Verify it's gone
      const deleted = await registrationStore.findByUrl(
        new URL('https://example.org/to-delete.json'),
      );
      expect(deleted).toBeUndefined();
    });
  });

  describe('SparqlAllowedDomainStore', () => {
    it('finds allowed domain names', async () => {
      expect(await allowedRegistrationDomainStore.contains('example.org')).toBe(
        false,
      );

      await sparqlClient.update(`
        INSERT DATA { 
          GRAPH <${allowedDomainsGraphIri}> { 
            [] <https://data.netwerkdigitaalerfgoed.nl/allowed_domain_names/def/domain_name> "example.org" .
          }
        }
      `);

      expect(await allowedRegistrationDomainStore.contains('example.org')).toBe(
        true,
      );
    });

    it('adds allowed domain names', async () => {
      expect(
        await allowedRegistrationDomainStore.contains('added-via-store.test'),
      ).toBe(false);

      await allowedRegistrationDomainStore.add('added-via-store.test');

      expect(
        await allowedRegistrationDomainStore.contains('added-via-store.test'),
      ).toBe(true);
    });

    it('does not duplicate when adding the same domain twice', async () => {
      await allowedRegistrationDomainStore.add('duplicate.test');
      await allowedRegistrationDomainStore.add('duplicate.test');

      const result = await sparqlClient.query(`
        SELECT (COUNT(*) AS ?count) WHERE {
          GRAPH <${allowedDomainsGraphIri}> {
            ?s <https://data.netwerkdigitaalerfgoed.nl/allowed_domain_names/def/domain_name> "duplicate.test" .
          }
        }
      `);
      const bindings = await result.toArray();
      expect(parseInt(bindings[0]!.get('count')!.value)).toEqual(1);
    });
  });

  describe('SparqlRatingStores', () => {
    it('stores ratings', async () => {
      const ratings = await sparqlClient.query(`
        PREFIX schema: <https://schema.org/>

        SELECT * WHERE {
          GRAPH <${ratingsGraphIri}> {
            ?s ?p ?o
          }
        }
      `);
      expect(await ratings.toArray()).toHaveLength(0);

      const rating = new Rating([new Penalty('test/path', 5)], 1);
      await ratingStore.store(new URL(TEST_DATASET_IRIS.DATASET_1), rating);

      // The completeness rating is stored as a single schema:Rating whose
      // schema:ratingValue is the score (100 minus the applied penalties).
      const stored = await sparqlClient.query(`
        PREFIX schema: <https://schema.org/>

        SELECT ?score WHERE {
          GRAPH <${ratingsGraphIri}> {
            <${TEST_DATASET_IRIS.DATASET_1}> schema:contentRating ?rating .
            ?rating schema:ratingValue ?score .
          }
        }
      `);
      const storedRows = await stored.toArray();
      expect(storedRows).toHaveLength(1);
      expect(storedRows[0]!.get('score')!.value).toBe('95');
    });

    it('deletes ratings', async () => {
      const datasetUri = new URL(TEST_DATASET_IRIS.DATASET_1);
      const rating = new Rating([new Penalty('test/path', 5)], 1);
      await ratingStore.store(datasetUri, rating);

      // Verify the completeness rating exists.
      const before = await sparqlClient.query(`
        PREFIX schema: <https://schema.org/>
        SELECT * WHERE {
          GRAPH <${ratingsGraphIri}> {
            <${datasetUri}> schema:contentRating ?rating .
          }
        }
      `);
      expect(await before.toArray()).toHaveLength(1);

      // Delete
      await ratingStore.delete(datasetUri);

      // Verify rating is gone
      const after = await sparqlClient.query(`
        PREFIX schema: <https://schema.org/>
        SELECT * WHERE {
          GRAPH <${ratingsGraphIri}> {
            <${datasetUri}> schema:contentRating ?rating .
          }
        }
      `);
      expect(await after.toArray()).toHaveLength(0);
    });
  });

  describe('SparqlDistributionHealthStore', () => {
    const url = new URL('https://example.com/dump.nt.gz');

    it('returns null when no record exists', async () => {
      expect(await distributionHealthStore.get(url)).toBeNull();
    });

    it('stores and retrieves a record with all optional fields populated', async () => {
      const probedAt = new Date('2026-05-01T10:00:00.000Z');
      const lastSuccessAt = new Date('2026-04-25T08:00:00.000Z');
      const firstFailureAt = new Date('2026-04-30T09:00:00.000Z');
      const outcome = factory.namedNode('https://def.nde.nl/probe#NotFound');

      await distributionHealthStore.store({
        url,
        lastProbedAt: probedAt,
        lastOutcome: outcome,
        lastSuccessAt,
        firstFailureAt,
        consecutiveFailures: 2,
        sourceFingerprint: '2026-04-30T09:00:00.000Z|1024',
      });

      const fetched = await distributionHealthStore.get(url);
      expect(fetched).not.toBeNull();
      expect(fetched!.url.toString()).toBe(url.toString());
      expect(fetched!.lastProbedAt.toISOString()).toBe(probedAt.toISOString());
      expect(fetched!.lastOutcome?.value).toBe(outcome.value);
      expect(fetched!.lastSuccessAt?.toISOString()).toBe(
        lastSuccessAt.toISOString(),
      );
      expect(fetched!.firstFailureAt?.toISOString()).toBe(
        firstFailureAt.toISOString(),
      );
      expect(fetched!.consecutiveFailures).toBe(2);
      expect(fetched!.sourceFingerprint).toBe('2026-04-30T09:00:00.000Z|1024');
    });

    it('stores and retrieves a record with optional fields omitted', async () => {
      const probedAt = new Date('2026-05-02T10:00:00.000Z');

      await distributionHealthStore.store({
        url,
        lastProbedAt: probedAt,
        lastOutcome: null,
        lastSuccessAt: null,
        firstFailureAt: null,
        consecutiveFailures: 0,
        sourceFingerprint: null,
      });

      const fetched = await distributionHealthStore.get(url);
      expect(fetched).not.toBeNull();
      expect(fetched!.lastOutcome).toBeNull();
      expect(fetched!.lastSuccessAt).toBeNull();
      expect(fetched!.firstFailureAt).toBeNull();
      expect(fetched!.consecutiveFailures).toBe(0);
      expect(fetched!.sourceFingerprint).toBeNull();
    });

    it('replaces the previous record on store (no accumulation)', async () => {
      await distributionHealthStore.store({
        url,
        lastProbedAt: new Date('2026-05-01T10:00:00.000Z'),
        lastOutcome: factory.namedNode('https://def.nde.nl/probe#NetworkError'),
        lastSuccessAt: null,
        firstFailureAt: new Date('2026-05-01T10:00:00.000Z'),
        consecutiveFailures: 1,
        sourceFingerprint: null,
      });

      await distributionHealthStore.store({
        url,
        lastProbedAt: new Date('2026-05-02T10:00:00.000Z'),
        lastOutcome: null,
        lastSuccessAt: new Date('2026-05-02T10:00:00.000Z'),
        firstFailureAt: null,
        consecutiveFailures: 0,
        sourceFingerprint: null,
      });

      const fetched = await distributionHealthStore.get(url);
      expect(fetched!.consecutiveFailures).toBe(0);
      expect(fetched!.lastOutcome).toBeNull();
      expect(fetched!.firstFailureAt).toBeNull();
      expect(fetched!.lastSuccessAt).not.toBeNull();
    });

    it('deletes a record', async () => {
      await distributionHealthStore.store({
        url,
        lastProbedAt: new Date(),
        lastOutcome: null,
        lastSuccessAt: new Date(),
        firstFailureAt: null,
        consecutiveFailures: 0,
        sourceFingerprint: null,
      });
      expect(await distributionHealthStore.get(url)).not.toBeNull();

      await distributionHealthStore.delete(url);
      expect(await distributionHealthStore.get(url)).toBeNull();
    });
  });

  describe('SparqlClient.constructQuads', () => {
    it('runs a CONSTRUCT and returns the resulting quads', async () => {
      await sparqlClient.update(`
        INSERT DATA {
          GRAPH <http://example.org/construct-test> {
            <http://example.org/s> <http://example.org/p> "object" .
          }
        }`);

      const quads = await sparqlClient.constructQuads(`
        CONSTRUCT { ?s <urn:out> ?o }
        WHERE { GRAPH <http://example.org/construct-test> { ?s <http://example.org/p> ?o } }`);

      const match = quads.find(
        (quad) => quad.subject.value === 'http://example.org/s',
      );
      expect(match?.predicate.value).toBe('urn:out');
      expect(match?.object.value).toBe('object');
    });

    it('throws on a malformed CONSTRUCT', async () => {
      await expect(
        sparqlClient.constructQuads('CONSTRUCT WHERE not-sparql'),
      ).rejects.toThrow(/CONSTRUCT failed/);
    });
  });

  describe('SparqlDistributionValidityStore', () => {
    const url = new URL('https://example.com/dump.ttl');
    const generatedAt = new Date('2026-06-18T12:00:00.000Z');

    const countTriples = async () => {
      const result = await sparqlClient.query(`
        SELECT (COUNT(?s) AS ?count) WHERE {
          GRAPH <${distributionValidityGraphIri}> { ?s ?p ?o }
        }
      `);
      return parseInt((await result.toArray())[0]!.get('count')!.value, 10);
    };

    const askMeasurementValue = async (value: 'true' | 'false') =>
      sparqlClient.queryBoolean(`
        PREFIX dqv: <http://www.w3.org/ns/dqv#>
        PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
        ASK {
          GRAPH <${distributionValidityGraphIri}> {
            ?m dqv:computedOn <${url.toString()}> ;
               dqv:value "${value}"^^xsd:boolean .
          }
        }
      `);

    it('stores an invalid verdict and replaces it with a valid one (no stale failure left behind)', async () => {
      await distributionValidityStore.store(
        url,
        distributionValidityQuads(
          {
            valid: false,
            reason: 'parse-error',
            message: 'Unexpected token',
            validatedFingerprint: 'fp-1',
            depth: 'shallow',
          },
          {
            distributionUrl: url.toString(),
            generatedAt,
            producer: 'urn:test',
          },
        ),
      );
      expect(await askMeasurementValue('false')).toBe(true);

      // Re-storing a now-valid verdict replaces the measurement wholesale: no
      // failure:reason and no false-valued measurement survive.
      await distributionValidityStore.store(
        url,
        distributionValidityQuads(
          { valid: true, validatedFingerprint: 'fp-2', depth: 'shallow' },
          {
            distributionUrl: url.toString(),
            generatedAt,
            producer: 'urn:test',
          },
        ),
      );
      expect(await askMeasurementValue('true')).toBe(true);
      expect(await askMeasurementValue('false')).toBe(false);
      const hasReason = await sparqlClient.queryBoolean(`
        PREFIX failure: <https://def.nde.nl/failure#>
        ASK {
          GRAPH <${distributionValidityGraphIri}> { ?s failure:reason ?o }
        }
      `);
      expect(hasReason).toBe(false);
    });

    it('deletes a measurement', async () => {
      await distributionValidityStore.store(
        url,
        distributionValidityQuads(
          { valid: true, validatedFingerprint: 'fp-1', depth: 'shallow' },
          {
            distributionUrl: url.toString(),
            generatedAt,
            producer: 'urn:test',
          },
        ),
      );
      expect(await countTriples()).toBeGreaterThan(0);

      await distributionValidityStore.delete(url);
      expect(await countTriples()).toBe(0);
    });
  });
});
