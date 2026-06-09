import { RegistrationStore } from '@dataset-register/core';
import { DatasetStore, extractIri } from '@dataset-register/core';
import {
  dereference,
  fetch,
  HttpError,
  NoDatasetFoundAtUrl,
  RequestTimeout,
} from '@dataset-register/core';
import pino from 'pino';
import { Valid, Validator } from '@dataset-register/core';
import { crawlCounter } from '@dataset-register/core';
import { rate, RatingStore } from '@dataset-register/core';
import {
  countWarnings,
  ValidationReportStore,
} from '@dataset-register/core';

export interface CrawlerOptions {
  /**
   * Per-request HTTP timeout (ms) applied to every page GET while dereferencing and
   * paginating a registration URL. Without it a slow or trickling host can hold a single
   * request open indefinitely and freeze the sequential crawl loop. Each page gets its
   * own fresh deadline, so a large healthy paginated catalogue is not cut off.
   */
  httpRequestTimeoutMs?: number;
}

export class Crawler {
  private readonly httpRequestTimeoutMs: number | undefined;

  constructor(
    private registrationStore: RegistrationStore,
    private datasetStore: DatasetStore,
    private ratingStore: RatingStore,
    private validationReportStore: ValidationReportStore,
    private validator: Validator,
    private logger: pino.Logger,
    options: CrawlerOptions = {},
  ) {
    // Leave undefined when unset: dereference()/fetch() own the single default.
    this.httpRequestTimeoutMs = options.httpRequestTimeoutMs;
  }

  /**
   * Crawl all registered URLs that were last read before `dateLastRead`.
   *
   * Scenarios:
   * - if the registration URL is still valid, update the Registration with the
   *   datasets currently found at the URL
   * - if the registration URL still works but no longer validates, store a
   *   schema:validUntil date in the Registration, keeping references to the
   *   datasets that were previously found at the URL when it was still valid
   * - if the registration URL no longer works, set both schema:validUntil and
   *   an HTTP status code (schema:status), keeping references to the datasets
   *   that were previously found at the URL when it was still valid.
   */
  public async crawl(dateLastRead: Date) {
    const registrations =
      await this.registrationStore.findRegistrationsReadBefore(dateLastRead);
    for (const registration of registrations) {
      this.logger.info(`Crawling registration URL ${registration.url}...`);
      let statusCode: number | undefined = undefined;
      let isValid = false;
      let datasetIris = registration.datasets;
      // Number of sh:Warning results in the registration's own description, taken
      // from the raw-data validation below — the same report the /validate
      // endpoint produces, so the dataset page and /validate stay consistent.
      // Left undefined when the URL yields no report (gone, no datasets).
      let warningCount: number | undefined = undefined;

      try {
        const data = await dereference(
          registration.url,
          this.httpRequestTimeoutMs,
        );
        const validationResult = await this.validator.validate(data);
        if (
          validationResult.state === 'valid' ||
          validationResult.state === 'invalid'
        ) {
          warningCount = countWarnings(validationResult.errors);
          await this.validationReportStore.store(
            registration.url,
            validationResult.errors,
          );
        }
        if (validationResult.state === 'valid') {
          statusCode = 200;
          isValid = true;
          this.logger.info(`${registration.url} passes validation`);
          datasetIris = []; // Start with a fresh list.
          for await (const dataset of fetch(
            registration.url,
            data,
            this.httpRequestTimeoutMs,
          )) {
            datasetIris.push(extractIri(dataset));
            await this.datasetStore.store(dataset);
            const dcatValidationResult = await this.validator.validate(dataset);
            const rating = rate(dcatValidationResult as Valid);
            await this.ratingStore.store(extractIri(dataset), rating);
          }
        } else if (validationResult.state === 'invalid') {
          statusCode = 200;
          this.logger.info(`${registration.url} does not pass validation`);
        } else {
          // 'no-dataset': URL responded but contained no Dataset triples.
          this.logger.info(`${registration.url} contains no datasets`);
        }
      } catch (e) {
        if (e instanceof RequestTimeout) {
          // A page exceeded the HTTP request timeout. Leave the registration
          // untouched so the next pass retries it, rather than recording a bogus
          // crawl result (e.g. marking a transiently slow host as gone).
          this.logger.warn(
            `Crawling registration URL ${registration.url} exceeded the HTTP request timeout; leaving it for the next pass`,
          );
          crawlCounter.add(1, {
            status: undefined,
            valid: false,
            timedOut: true,
          });
          continue;
        } else if (e instanceof HttpError) {
          statusCode = e.statusCode;
          this.logger.info(
            `${registration.url} returned HTTP error ${statusCode}`,
          );
        } else if (e instanceof NoDatasetFoundAtUrl) {
          this.logger.info({ err: e }, `${registration.url} has no datasets`);
        } else {
          this.logger.warn(
            { err: e },
            `${registration.url} fetch or parse failed`,
          );
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
        undefined,
        warningCount,
      );
      await this.registrationStore.store(updatedRegistration);
    }
  }
}
