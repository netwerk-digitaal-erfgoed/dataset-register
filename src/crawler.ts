import {RegistrationStore} from './registration.js';
import {DatasetStore, extractIri, extractIris} from './dataset.js';
import {dereference, fetch, HttpError, NoDatasetFoundAtUrl} from './fetch.js';
import DatasetExt from 'rdf-ext/lib/Dataset';
import Pino from 'pino';
import {Valid, Validator} from './validator.js';
import {crawlCounter} from './instrumentation.js';
import {rate, RatingStore} from './rate.js';

export class Crawler {
  constructor(
    private registrationStore: RegistrationStore,
    private datasetStore: DatasetStore,
    private ratingStore: RatingStore,
    private validator: Validator,
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
      let isValid = false;

      try {
        const data = await dereference(registration.url);
        const validationResult = await this.validator.validate(data);
        isValid = validationResult.state === 'valid';
        if (isValid) {
          datasets = await fetch(registration.url);
          await this.datasetStore.store(datasets);
          datasets.map(async dataset => {
            const dcatValidationResult = await this.validator.validate(dataset);
            const rating = rate(dcatValidationResult as Valid);
            await this.ratingStore.store(extractIri(dataset), rating);
          });
        }
      } catch (e) {
        if (e instanceof HttpError) {
          statusCode = e.statusCode;
        }

        if (e instanceof NoDatasetFoundAtUrl) {
          // Request was successful, but no datasets exist any longer at the URL.
        }
      }

      crawlCounter.add(1, {
        status: statusCode,
        valid: isValid,
      });

      const updatedRegistration = registration.read(
        [...extractIris(datasets).keys()],
        statusCode,
        isValid
      );
      await this.registrationStore.store(updatedRegistration);
    }
  }
}
