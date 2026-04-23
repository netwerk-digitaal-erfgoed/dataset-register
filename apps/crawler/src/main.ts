import { scheduleJob } from 'node-schedule';
import { Crawler } from './crawler.js';
import {
  CompositeValidator,
  DistributionProbeStage,
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
// Lenient mode: probe every distribution each crawl round, but only promote failures to
// sh:Violation when the health store shows the streak is persistent (defaults: 3
// consecutive failures or 7 days since the first failure). Transient blips don’t
// penalise the rating.
const validator = new CompositeValidator(
  new ShaclEngineValidator(shacl),
  new DistributionProbeStage({ healthStore: distributionHealthStore }),
);

const crawler = new Crawler(
  registrationStore,
  datasetStore,
  ratingStore,
  validator,
  logger,
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
