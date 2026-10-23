import { describe, expect, it, beforeEach } from 'vitest';
import factory from 'rdf-ext';
import { DatasetRemover } from '../src/dataset-remover.js';
import {
  MockDatasetStore,
  MockDistributionHealthStore,
  MockDistributionValidityStore,
  MockRatingStore,
  MockRegistrationStore,
} from '../src/mock.js';
import { Registration } from '../src/registration.js';
import { dcat, rdf } from '../src/query.js';

const registrationUrl = new URL('https://example.com/catalog');
const otherRegistrationUrl = new URL('https://example.com/other-catalog');

describe('DatasetRemover', () => {
  let registrationStore: MockRegistrationStore;
  let datasetStore: MockDatasetStore;
  let ratingStore: MockRatingStore;
  let distributionHealthStore: MockDistributionHealthStore;
  let distributionValidityStore: MockDistributionValidityStore;
  let remover: DatasetRemover;

  beforeEach(() => {
    registrationStore = new MockRegistrationStore();
    datasetStore = new MockDatasetStore();
    ratingStore = new MockRatingStore();
    distributionHealthStore = new MockDistributionHealthStore();
    distributionValidityStore = new MockDistributionValidityStore();
    remover = new DatasetRemover({
      registrationStore,
      datasetStore,
      ratingStore,
      distributionHealthStore,
      distributionValidityStore,
    });
  });

  it('removes a dataset with its rating and probe records', async () => {
    const datasetIri = await storeDataset('https://example.com/dataset', [
      'https://example.com/dump.nt',
    ]);
    const deletedRatings: string[] = [];
    ratingStore.delete = async (iri) => {
      deletedRatings.push(iri.toString());
    };

    const removed = await remover.remove([datasetIri], registrationUrl);

    expect(removed).toEqual([datasetIri]);
    expect(await datasetStore.findAll()).toEqual([]);
    expect(deletedRatings).toEqual([datasetIri.toString()]);
    expect(distributionHealthStore.records.size).toBe(0);
    expect(distributionValidityStore.measurements.size).toBe(0);
  });

  it('keeps a dataset that another registration lists', async () => {
    const datasetIri = await storeDataset('https://example.com/dataset', [
      'https://example.com/dump.nt',
    ]);
    await listOn(otherRegistrationUrl, datasetIri);

    const removed = await remover.remove([datasetIri], registrationUrl);

    expect(removed).toEqual([]);
    expect(await datasetStore.findAll()).toEqual([datasetIri]);
    expect(distributionHealthStore.records.size).toBe(1);
  });

  it('does not count the registration it removes the datasets for', async () => {
    const datasetIri = await storeDataset('https://example.com/dataset', []);
    await listOn(registrationUrl, datasetIri);

    expect(await remover.remove([datasetIri], registrationUrl)).toEqual([
      datasetIri,
    ]);
  });

  it('keeps the probe records of a URL that another dataset references', async () => {
    const datasetIri = await storeDataset('https://example.com/dataset', [
      'https://example.com/shared.nt',
      'https://example.com/own.nt',
    ]);
    // Referenced with a fragment, which the probe does not send.
    await storeDataset('https://example.com/other-dataset', [
      'https://example.com/shared.nt#all',
    ]);

    await remover.remove([datasetIri], registrationUrl);

    expect([...distributionHealthStore.records.keys()]).toEqual([
      'https://example.com/shared.nt',
    ]);
    expect([...distributionValidityStore.measurements.keys()]).toEqual([
      'https://example.com/shared.nt',
    ]);
  });

  it('matches a URL as the descriptions write it, not as the probe keys it', async () => {
    const datasetIri = await storeDataset('https://example.com/dataset', [
      'https://Example.com',
    ]);
    await storeDataset('https://example.com/other-dataset', [
      'https://Example.com',
    ]);

    await remover.remove([datasetIri], registrationUrl);

    expect([...distributionHealthStore.records.keys()]).toEqual([
      'https://example.com/',
    ]);
  });

  it('removes the probe records keyed by a URL without its fragment', async () => {
    const datasetIri = await storeDataset('https://example.com/dataset', [
      'https://example.com/sparql#query',
    ]);

    await remover.remove([datasetIri], registrationUrl);

    expect(distributionHealthStore.records.size).toBe(0);
  });

  it('finishes a removal that stopped halfway when run again', async () => {
    const datasetIri = await storeDataset('https://example.com/dataset', [
      'https://example.com/dump.nt',
    ]);
    const deleteMeasurements = distributionValidityStore.delete.bind(
      distributionValidityStore,
    );
    distributionValidityStore.delete = async () => {
      throw new Error('Store unavailable');
    };

    await expect(remover.remove([datasetIri], registrationUrl)).rejects.toThrow(
      'Store unavailable',
    );

    distributionValidityStore.delete = deleteMeasurements;
    expect(await remover.remove([datasetIri], registrationUrl)).toEqual([
      datasetIri,
    ]);
    expect(await datasetStore.findAll()).toEqual([]);
    expect(distributionHealthStore.records.size).toBe(0);
    expect(distributionValidityStore.measurements.size).toBe(0);
  });

  it('does nothing without datasets', async () => {
    expect(await remover.remove([], registrationUrl)).toEqual([]);
  });

  it('removes the datasets no registration lists', async () => {
    const unlisted = await storeDataset('https://example.com/unlisted', []);
    const listed = await storeDataset('https://example.com/listed', []);
    await listOn(registrationUrl, listed);

    expect(await remover.removeUnlisted({ dryRun: true })).toEqual([unlisted]);
    expect(await datasetStore.findAll()).toEqual([unlisted, listed]);

    expect(await remover.removeUnlisted()).toEqual([unlisted]);
    expect(await datasetStore.findAll()).toEqual([listed]);
  });

  /**
   * Store a dataset whose distributions have the given access URLs, with probe records
   * keyed as the probe keys them.
   */
  async function storeDataset(iri: string, accessUrls: string[]) {
    const dataset = factory.namedNode(iri);
    const quads = [factory.quad(dataset, rdf('type'), dcat('Dataset'))];
    for (const [index, accessUrl] of accessUrls.entries()) {
      const distribution = factory.blankNode(`${iri}-distribution-${index}`);
      quads.push(
        factory.quad(dataset, dcat('distribution'), distribution),
        factory.quad(
          distribution,
          dcat('accessURL'),
          factory.namedNode(accessUrl),
        ),
      );
      const probeUrl = new URL(accessUrl);
      probeUrl.hash = '';
      await distributionHealthStore.store({
        url: probeUrl,
        lastProbedAt: new Date('2026-01-01'),
        lastOutcome: null,
        lastSuccessAt: null,
        firstFailureAt: new Date('2026-01-01'),
        consecutiveFailures: 1,
        sourceFingerprint: null,
      });
      await distributionValidityStore.store(probeUrl, [
        factory.quad(
          factory.namedNode(probeUrl.toString()),
          rdf('type'),
          dcat('Distribution'),
        ),
      ]);
    }
    await datasetStore.store(factory.dataset(quads));

    return new URL(iri);
  }

  async function listOn(url: URL, datasetIri: URL) {
    await registrationStore.store(
      new Registration(url, new Date(), undefined, [datasetIri]),
    );
  }
});
