import {RegistrationStore} from './registration.js';
import {DatasetStore, extractIri} from './dataset.js';
import {dereference, fetch, HttpError, NoDatasetFoundAtUrl} from './fetch.js';
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
      this.logger.info(`Crawling registration URL ${registration.url}...`);
      let statusCode = 200;
      let isValid = false;
      const datasetIris: URL[] = [];

      try {
        const data = await dereference(registration.url);
        const validationResult = await this.validator.validate(data);
        isValid = validationResult.state === 'valid';
        if (isValid) {
          this.logger.info(`${registration.url} passes validation`);
          for await (const dataset of fetch(registration.url)) {
            datasetIris.push(extractIri(dataset));
            await this.datasetStore.store(dataset);
            const dcatValidationResult = await this.validator.validate(dataset);
            const rating = rate(dcatValidationResult as Valid);
            await this.ratingStore.store(extractIri(dataset), rating);
          }
        } else {
          this.logger.info(`${registration.url} does not pass validation`);
        }
      } catch (e) {
        if (e instanceof HttpError) {
          statusCode = e.statusCode;
          this.logger.info(
            `${registration.url} returned HTTP error ${statusCode}`
          );
        }

        if (e instanceof NoDatasetFoundAtUrl) {
          // Request was successful, but no datasets exist any longer at the URL.
          this.logger.info(`${registration.url} has no datasets`);
        }
      }

      crawlCounter.add(1, {
        status: statusCode,
        valid: isValid,
      });

      const updatedRegistration = registration.read(
        datasetIris,
        statusCode,
        isValid
      );
      await this.registrationStore.store(updatedRegistration);
    }
  }
}
