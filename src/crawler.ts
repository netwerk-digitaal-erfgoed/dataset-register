import {Registration, RegistrationStore} from './registration';
import {DatasetStore, extractIris} from './dataset';
import {fetch, NoDatasetFoundAtUrl, UrlNotFound} from './fetch';
import DatasetExt from 'rdf-ext/lib/Dataset';

export class Crawler {
  constructor(
    private registrationStore: RegistrationStore,
    private datasetStore: DatasetStore
  ) {}

  /**
   * Crawl all registered URLs that were last read before `dateLastRead`.
   */
  public async crawl(dateLastRead: Date) {
    const registrations = await this.registrationStore.findRegistrationsReadBefore(
      dateLastRead
    );
    for (const registration of registrations) {
      let datasets: DatasetExt[] = [];
      let statusCode: number;

      try {
        datasets = await fetch(registration.url);
        this.datasetStore.store(datasets);
        statusCode = 200;
      } catch (e) {
        if (e instanceof UrlNotFound || e instanceof NoDatasetFoundAtUrl) {
          statusCode = parseInt(e.message);
        } else {
          throw e;
        }
      }

      const updatedRegistration = new Registration(
        registration.url,
        registration.datePosted,
        [...extractIris(datasets).keys()]
      );
      updatedRegistration.read(statusCode);
      this.registrationStore.store(updatedRegistration);
    }
  }
}
