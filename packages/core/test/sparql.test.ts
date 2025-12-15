import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { QLeverContainer } from './qlever-container.js';
import {
  SparqlAllowedRegistrationDomainStore,
  SparqlClient,
  SparqlDatasetStore,
  SparqlRatingStore,
  SparqlRegistrationStore,
  stores,
} from '../src/sparql.js';
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

describe('SPARQL', () => {
  let qleverContainer: QLeverContainer;
  let sparqlClient: SparqlClient;
  let registrationStore: SparqlRegistrationStore;
  let datasetStore: SparqlDatasetStore;
  let allowedRegistrationDomainStore: SparqlAllowedRegistrationDomainStore;
  let ratingStore: SparqlRatingStore;

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
    } = stores(
      sparqlEndpoint,
      qleverContainer.accessToken,
      registrationsGraphIri,
      allowedDomainsGraphIri,
      ratingsGraphIri,
    ));
  }, 20_000);

  afterAll(async () => {
    await qleverContainer.stop();
  });

  beforeEach(async () => {
    await qleverContainer.clearData();
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
        PREFIX schema: <http://schema.org/>
        
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

    it('should return undefined for non-existent URL', async () => {
      const found = await registrationStore.findByUrl(
        new URL('https://example.org/nonexistent.json'),
      );

      expect(found).toBeUndefined();
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
  });

  describe('SparqlRatingStores', () => {
    it('stores ratings', async () => {
      const ratings = await sparqlClient.query(`
        PREFIX schema: <http://schema.org/>
        
        SELECT * WHERE {
          GRAPH <${ratingsGraphIri}> {
            ?s ?p ?o 
          }
        }
      `);
      expect(await ratings.toArray()).toHaveLength(0);

      const rating = new Rating([new Penalty('test/path', 5)], 1);
      await ratingStore.store(new URL(TEST_DATASET_IRIS.DATASET_1), rating);
    });
  });
});
