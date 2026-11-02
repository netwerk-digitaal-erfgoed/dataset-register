import {
  DatasetRemover,
  DatasetStore,
  extractIri,
  fetch,
  Registration,
  RegistrationStore,
  type ResolvedSource,
} from '@dataset-register/core';
import type { FastifyBaseLogger } from 'fastify';

/**
 * Registers a validated source. `POST /datasets` responds before this runs, so it is
 * injected into `server()` and the returned promise lets a caller (such as a test)
 * await the outcome.
 */
export type Register = (
  source: ResolvedSource,
  log: FastifyBaseLogger,
) => Promise<void>;

/**
 * Store the registration of a validated source, then fetch and store the datasets it
 * lists and remove those it no longer lists.
 */
export function registrar(
  registrationStore: RegistrationStore,
  datasetStore: DatasetStore,
  datasetRemover?: DatasetRemover,
): Register {
  return async ({ url, data, mediaType }, log) => {
    // The URL has validated, so any problems with processing the dataset are now ours. Therefore, make sure to
    // store the registration so we can come back to that when crawling, even if fetching the datasets fails.
    // Store first rather than wrapping in a try/catch to cope with OOMs.
    // Keep original datePosted if re-registering an existing URL.
    const existingRegistration = await registrationStore.findByUrl(url);
    const datePosted = existingRegistration?.datePosted ?? new Date();
    // Carry the crawl clock over: re-registering reads the URL and re-stores the
    // description, but probes nothing, so it must not defer the next crawl.
    // Carry the warning count over too: re-registering stores no validation report, so
    // claiming a fresh count the report graph cannot back up would make the dataset page
    // and /validate disagree. Blanking it is worse still – the page would read “no
    // warnings” until the next crawl.
    const registration = new Registration(
      url,
      datePosted,
      undefined,
      [],
      existingRegistration?.dateCrawled,
      existingRegistration?.warningCount,
    );
    await registrationStore.store(registration);

    // Fetch dataset descriptions and store them.
    const datasetIris: URL[] = [];
    for await (const dataset of fetch(url, data)) {
      datasetIris.push(extractIri(dataset));
      await datasetStore.store(dataset);
    }

    log.info(`Found ${datasetIris.length} datasets at ${url.toString()}`);

    // Update registration with dataset descriptions that we found.
    // Pass the media type so a manual re-registration records it too, and does not
    // blank out what the last crawl recorded.
    const updatedRegistration = registration.read({
      datasets: datasetIris,
      statusCode: 200,
      valid: true,
      warningCount: existingRegistration?.warningCount,
      mediaType,
    });
    await registrationStore.store(updatedRegistration);

    // The descriptions found now supersede those of datasets the URL no longer lists.
    // Logged rather than thrown: the registration itself has succeeded.
    const found = new Set(
      datasetIris.map((datasetIri) => datasetIri.toString()),
    );
    try {
      await datasetRemover?.remove(
        (existingRegistration?.datasets ?? []).filter(
          (datasetIri) => !found.has(datasetIri.toString()),
        ),
        url,
      );
    } catch (error) {
      log.warn(
        { err: error },
        `Removing the datasets ${url.toString()} no longer lists failed`,
      );
    }
  };
}
