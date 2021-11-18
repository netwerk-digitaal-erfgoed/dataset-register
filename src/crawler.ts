import {Registration, RegistrationStore} from './registration';
import {DatasetStore, extractIris} from './dataset';
import {fetch, HttpError, NoDatasetFoundAtUrl} from './fetch';
import DatasetExt from 'rdf-ext/lib/Dataset';
import Pino from 'pino';

export class Crawler {
  constructor(
    private registrationStore: RegistrationStore,
    private datasetStore: DatasetStore,
    private logger: Pino.Logger
  ) {}

  /**
   * Crawl all registered URLs that were last read before `dateLastRead`.
   */
  public async crawl(dateLastRead: Date) {
    const registrations =
      await this.registrationStore.findRegistrationsReadBefore(dateLastRead);
    for (const registration of registrations) {
      this.logger.info(`Crawling registration URL ${registration.url}`);
      let datasets: DatasetExt[] = [];
      let statusCode = 200;

      try {
        datasets = await fetch(registration.url);
        this.datasetStore.store(datasets);
      } catch (e) {
        if (e instanceof HttpError) {
          statusCode = e.statusCode;
        } else if (e instanceof NoDatasetFoundAtUrl) {
          // Request was successful, but no datasets exist any longer at the URL, so ignore.
        } else {
          throw e;
        }
      }

      const updatedRegistration = new Registration(
        registration.url,
        registration.datePosted
      );
      updatedRegistration.read([...extractIris(datasets).keys()], statusCode);
      this.registrationStore.store(updatedRegistration);
    }
  }
}
