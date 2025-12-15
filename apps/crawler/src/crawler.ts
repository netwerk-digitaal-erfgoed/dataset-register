import { RegistrationStore } from '@dataset-register/core';
import { DatasetStore, extractIri } from '@dataset-register/core';
import {
  dereference,
  fetch,
  HttpError,
  NoDatasetFoundAtUrl,
} from '@dataset-register/core';
import pino from 'pino';
import { Valid, Validator } from '@dataset-register/core';
import { crawlCounter } from '@dataset-register/core';
import { rate, RatingStore } from '@dataset-register/core';

export class Crawler {
  constructor(
    private registrationStore: RegistrationStore,
    private datasetStore: DatasetStore,
    private ratingStore: RatingStore,
    private validator: Validator,
    private logger: pino.Logger,
  ) {}

  /**
   * Crawl all registered URLs that were last read before `dateLastRead`.
   *
   * Scenarios:
   * - if the registration URL is still valid, update the Registration with the
   *   datasets currently found at the URL
   * - if the registration URL still works but no longer validates, store a
   *   schema:validUntil date in the Registration, keeping references to the
   *   datasets that were previously found at the URL when it was still valid
   * - if the registration URL no longer works, remove the references to the
   *   datasets previously found at it, set both schema:validUntil and an HTTP
   *   status code (schema:status).
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
          // Keep the old datasets reference for the Valid / All datasets toggle.
          datasetIris.push(...registration.datasets);
        }
      } catch (e) {
        if (e instanceof HttpError) {
          statusCode = e.statusCode;
          this.logger.info(
            `${registration.url} returned HTTP error ${statusCode}`,
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
        isValid,
      );
      await this.registrationStore.store(updatedRegistration);
    }
  }
}
