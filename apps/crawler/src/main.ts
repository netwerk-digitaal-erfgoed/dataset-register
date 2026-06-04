import { scheduleJob } from 'node-schedule';
import { Crawler } from './crawler.js';
import {
  CompositeValidator,
  DistributionProbeStage,
  readProbeSeverities,
  readUrl,
  ShaclEngineValidator,
  stores,
} from '@dataset-register/core';
import pino from 'pino';
import { config } from './config.js';

const {
  datasetStore,
  registrationStore,
  ratingStore,
  distributionHealthStore,
} = stores(config.SPARQL_URL, config.SPARQL_ACCESS_TOKEN);

const shacl = await readUrl('requirements/shacl.ttl');
const logger = pino();
// Lenient mode: probe every distribution each crawl round, but only emit a failure once the
// health store shows the streak is persistent (default: 7 days since the first failure).
// Transient blips don’t penalise the rating. Emitted failures carry the sh:severity the shapes
// declare for each check (reachability and format-match are sh:Warning today).
const validator = new CompositeValidator(
  new ShaclEngineValidator(shacl),
  new DistributionProbeStage({
    healthStore: distributionHealthStore,
    maxProbes: config.CRAWLER_MAX_DISTRIBUTION_PROBES,
    severities: readProbeSeverities(shacl),
    logger,
  }),
);

const crawler = new Crawler(
  registrationStore,
  datasetStore,
  ratingStore,
  validator,
  logger,
  { httpRequestTimeoutMs: config.HTTP_REQUEST_TIMEOUT * 1000 },
);

// Schedule crawler to check every hour for registrations that have expired their REGISTRATION_URL_TTL.
const ttl = config.REGISTRATION_URL_TTL * 1000;
if (config.CRAWLER_SCHEDULE === undefined) {
  await crawler.crawl(new Date(Date.now() - ttl));
} else {
  logger.info(`Crawler scheduled at ${config.CRAWLER_SCHEDULE}`);
  scheduleJob(config.CRAWLER_SCHEDULE, async () => {
    await crawler.crawl(new Date(Date.now() - ttl));
  });
}
