import {Registration, RegistrationStore} from './registration';
import {DatasetStore, extractIris} from './dataset';
import {fetch, NoDatasetFoundAtUrl, UrlNotFound} from './fetch';
import DatasetExt from 'rdf-ext/lib/Dataset';
import {Validator} from './validator';

export class Crawler {
  constructor(
    private registrationStore: RegistrationStore,
    private datasetStore: DatasetStore,
    private validator: Validator
  ) {}

  /**
   * Crawl all registered URLs that were last read before `dateLastRead`.
   */
  public async crawl(dateLastRead: Date) {
    const registrations = await this.registrationStore.findRegistrationsReadBefore(
      dateLastRead
    );
    for (const registration of registrations) {
      let datasets: DatasetExt[];

      try {
        datasets = await fetch(registration.url);
      } catch (e) {
        if (e instanceof UrlNotFound || e instanceof NoDatasetFoundAtUrl) {
          // Ignore
          continue;
        }
        throw e;
      }

      if ((await this.validator.validate(datasets)) === null) {
        this.datasetStore.store(datasets);

        const updatedRegistration = new Registration(
          registration.url,
          registration.datePosted,
          [...extractIris(datasets).keys()]
        );
        updatedRegistration.read();
        this.registrationStore.store(updatedRegistration);
      }
    }
  }
}
