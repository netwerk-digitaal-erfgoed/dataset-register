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

export class MockRegistrationStore implements RegistrationStore {
  private readonly registrations: Map<URL, Registration> = new Map();

  all(): Registration[] {
    return [...this.registrations.values()];
  }

  findRegistrationsReadBefore(date: Date): Promise<Registration[]> {
    return Promise.resolve(
      [...this.registrations.values()].filter(
        (registration: Registration) =>
          registration.dateRead && registration.dateRead < date,
      ),
    );
  }

  isRegistered(url: URL) {
    return this.all().some(
      (registration) => registration.url.toString() === url.toString(),
    );
  }

  async store(registration: Registration): Promise<void> {
    this.registrations.set(registration.url, registration);
  }

  findByUrl(url: URL): Promise<Registration | undefined> {
    const found = [...this.registrations.values()].find(
      (registration) => registration.url.toString() === url.toString(),
    );
    return Promise.resolve(found);
  }
}

export class MockAllowedRegistrationDomainStore implements AllowedRegistrationDomainStore {
  private readonly domainNames: Array<string> = ['netwerkdigitaalerfgoed.nl'];

  contains(domainName: string): Promise<boolean> {
    return Promise.resolve(this.domainNames.includes(domainName));
  }
}

export class MockDatasetStore implements DatasetStore {
  private datasets: DatasetExt[] = [];

  async store(datasets: DatasetExt): Promise<void> {
    this.datasets.push(datasets);
  }

  countDatasets(): Promise<number> {
    return Promise.resolve(this.datasets.length);
  }

  countOrganisations(): Promise<number> {
    return Promise.resolve(0);
  }
}

export class MockRatingStore implements RatingStore {
  public readonly ratings: Rating[] = [];
  async store(datasetUri: URL, rating: Rating): Promise<void> {
    this.ratings.push(rating);
  }
}

export const file = async (filename: string) =>
  await fs.promises.readFile(`test/datasets/${filename}`, 'utf-8');
