import {
  AllowedRegistrationDomainStore,
  Registration,
  RegistrationStore,
} from '../src/registration';
import {URL} from 'url';
import {DatasetStore} from '../src/dataset';
import DatasetExt from 'rdf-ext/lib/Dataset';

export class MockRegistrationStore implements RegistrationStore {
  private readonly registrations: Map<URL, Registration> = new Map();

  all(): Registration[] {
    return [...this.registrations.values()];
  }

  findRegistrationsReadBefore(date: Date): Promise<Registration[]> {
    return Promise.resolve(
      [...this.registrations.values()].filter(
        (registration: Registration) =>
          registration.dateRead && registration.dateRead < date
      )
    );
  }

  isRegistered(url: URL) {
    return this.all().some(
      registration => registration.url.toString() === url.toString()
    );
  }

  store(registration: Registration): void {
    this.registrations.set(registration.url, registration);
  }
}

export class MockAllowedRegistrationDomainStore
  implements AllowedRegistrationDomainStore
{
  private readonly domainNames: Array<string> = ['netwerkdigitaalerfgoed.nl'];

  contains(domainName: string): Promise<boolean> {
    return Promise.resolve(this.domainNames.includes(domainName));
  }
}

export class MockDatasetStore implements DatasetStore {
  private readonly datasets = [];

  store(datasets: DatasetExt[]): void {
    datasets.push(...datasets);
  }
}
