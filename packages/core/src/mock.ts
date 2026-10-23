import type {
  AllowedRegistrationDomainStore,
  Registration,
  RegistrationStore,
} from './registration.ts';
import { URL } from 'node:url';
import type { DatasetStore } from './dataset.ts';
import fs from 'node:fs';
import DatasetExt from 'rdf-ext/lib/Dataset.js';
import type { Rating, RatingStore } from './rate.ts';
import type { DatasetCore, Quad } from '@rdfjs/types';
import type { ValidationReportStore } from './validation-report.ts';
import { extractIri } from './dataset.ts';
import { dcat } from './query.ts';
import type {
  DistributionHealthRecord,
  DistributionHealthStore,
} from './distribution-health-store.ts';
import type {
  DistributionValidityMeasurement,
  DistributionValidityStore,
} from './distribution-validity-store.ts';

export class MockRegistrationStore implements RegistrationStore {
  private readonly registrations: Map<URL, Registration> = new Map();

  all(): Registration[] {
    return [...this.registrations.values()];
  }

  findRegistrationsCrawledBefore(date: Date): Promise<Registration[]> {
    return Promise.resolve(
      [...this.registrations.values()].filter(
        (registration: Registration) =>
          registration.dateCrawled === undefined ||
          registration.dateCrawled < date,
      ),
    );
  }

  isRegistered(url: URL) {
    return this.all().some(
      (registration) => registration.url.toString() === url.toString(),
    );
  }

  async store(registration: Registration): Promise<void> {
    await this.delete(registration.url);
    this.registrations.set(registration.url, registration);
  }

  async update(registration: Registration): Promise<boolean> {
    if (!this.isRegistered(registration.url)) {
      return false;
    }
    await this.delete(registration.url);
    await this.store(registration);
    return true;
  }

  findByUrl(url: URL): Promise<Registration | undefined> {
    const found = [...this.registrations.values()].find(
      (registration) => registration.url.toString() === url.toString(),
    );
    return Promise.resolve(found);
  }

  findListedDatasets(datasetIris: URL[], exceptUrl?: URL): Promise<URL[]> {
    const listed = new Set(
      this.all()
        .filter(
          (registration) =>
            registration.url.toString() !== exceptUrl?.toString(),
        )
        .flatMap((registration) =>
          registration.datasets.map((datasetIri) => datasetIri.toString()),
        ),
    );
    return Promise.resolve(
      datasetIris.filter((datasetIri) => listed.has(datasetIri.toString())),
    );
  }

  async delete(url: URL): Promise<void> {
    const key = [...this.registrations.keys()].find(
      (k) => k.toString() === url.toString(),
    );
    if (key) {
      this.registrations.delete(key);
    }
  }
}

export class MockAllowedRegistrationDomainStore implements AllowedRegistrationDomainStore {
  private readonly domainNames: Array<string> = [
    'netwerkdigitaalerfgoed.nl',
    'allowed.parent.example',
  ];

  contains(...domainNames: Array<string>): Promise<boolean> {
    return Promise.resolve(
      domainNames.some((domainName) => this.domainNames.includes(domainName)),
    );
  }

  async add(domainName: string): Promise<void> {
    if (!this.domainNames.includes(domainName)) {
      this.domainNames.push(domainName);
    }
  }
}

export class MockDatasetStore implements DatasetStore {
  private datasets: DatasetExt[] = [];

  async store(datasets: DatasetExt): Promise<void> {
    this.datasets.push(datasets);
  }

  async delete(datasetUri: URL): Promise<void> {
    this.datasets = this.datasets.filter(
      (dataset) => extractIri(dataset).toString() !== datasetUri.toString(),
    );
  }

  findAll(): Promise<URL[]> {
    return Promise.resolve(this.datasets.map(extractIri));
  }

  findDistributionUrls(datasetIris: URL[]): Promise<string[]> {
    return Promise.resolve(
      this.distributionUrls(
        this.datasets.filter((dataset) =>
          datasetIris.some(
            (datasetIri) =>
              datasetIri.toString() === extractIri(dataset).toString(),
          ),
        ),
      ),
    );
  }

  findReferencedDistributionUrls(urls: string[]): Promise<string[]> {
    return Promise.resolve(
      this.distributionUrls(this.datasets).filter((reference) =>
        urls.some(
          (url) => reference === url || reference.startsWith(`${url}#`),
        ),
      ),
    );
  }

  countDatasets(): Promise<number> {
    return Promise.resolve(this.datasets.length);
  }

  countOrganisations(): Promise<number> {
    return Promise.resolve(0);
  }

  private distributionUrls(datasets: DatasetExt[]): string[] {
    return datasets.flatMap((dataset) =>
      [
        ...dataset.match(null, dcat('accessURL'), null),
        ...dataset.match(null, dcat('downloadURL'), null),
      ].map((quad) => quad.object.value),
    );
  }
}

export class MockRatingStore implements RatingStore {
  public readonly ratings: Rating[] = [];

  async store(_datasetUri: URL, rating: Rating): Promise<void> {
    this.ratings.push(rating);
  }

  async delete(_datasetUri: URL): Promise<void> {
    // In mock, we don't track ratings by URI, so this is a no-op
  }
}

export class MockValidationReportStore implements ValidationReportStore {
  public readonly reports: Map<string, DatasetCore> = new Map();

  async store(registrationUrl: URL, report: DatasetCore): Promise<void> {
    this.reports.set(registrationUrl.toString(), report);
  }

  async delete(registrationUrl: URL): Promise<void> {
    this.reports.delete(registrationUrl.toString());
  }
}

export class MockDistributionHealthStore implements DistributionHealthStore {
  public readonly records: Map<string, DistributionHealthRecord> = new Map();

  async get(url: URL): Promise<DistributionHealthRecord | null> {
    return this.records.get(url.toString()) ?? null;
  }

  async getMany(urls: URL[]): Promise<Map<string, DistributionHealthRecord>> {
    return new Map(
      urls.flatMap((url) => {
        const record = this.records.get(url.toString());
        return record ? [[url.toString(), record]] : [];
      }),
    );
  }

  async store(record: DistributionHealthRecord): Promise<void> {
    this.records.set(record.url.toString(), record);
  }

  async storeMany(records: DistributionHealthRecord[]): Promise<void> {
    records.forEach((record) =>
      this.records.set(record.url.toString(), record),
    );
  }

  async delete(url: URL): Promise<void> {
    this.records.delete(url.toString());
  }
}

export class MockDistributionValidityStore implements DistributionValidityStore {
  public readonly measurements: Map<string, Quad[]> = new Map();

  async store(accessUrl: URL, quads: Quad[]): Promise<void> {
    await this.storeMany([{ accessUrl, quads }]);
  }

  async storeMany(
    measurements: DistributionValidityMeasurement[],
  ): Promise<void> {
    for (const { accessUrl, quads } of measurements) {
      if (quads.length === 0) {
        this.measurements.delete(accessUrl.toString());
      } else {
        this.measurements.set(accessUrl.toString(), quads);
      }
    }
  }

  async delete(accessUrl: URL): Promise<void> {
    this.measurements.delete(accessUrl.toString());
  }
}

export const file = async (filename: string) =>
  await fs.promises.readFile(`test/datasets/${filename}`, 'utf-8');
