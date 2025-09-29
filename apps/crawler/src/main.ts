import { scheduleJob } from 'node-schedule';
import { Crawler } from './crawler.js';
import { readUrl, ShaclEngineValidator, stores } from '@dataset-register/core';
import pino from 'pino';
import { config } from './config.js';

const { datasetStore, registrationStore, ratingStore } = stores(
  config.SPARQL_URL,
  config.SPARQL_ACCESS_TOKEN,
);

const shacl = await readUrl('requirements/shacl.ttl');
const logger = pino();
const validator = new ShaclEngineValidator(shacl);

const crawler = new Crawler(
  registrationStore,
  datasetStore,
  ratingStore,
  validator,
  logger,
);

// Schedule crawler to check every hour for registrations that have expired their REGISTRATION_URL_TTL.
const ttl = config.REGISTRATION_URL_TTL * 1000;
if (config.CRAWLER_SCHEDULE !== undefined) {
  logger.info(`Crawler scheduled at ${config.CRAWLER_SCHEDULE}`);
  scheduleJob(config.CRAWLER_SCHEDULE, async () => {
    await crawler.crawl(new Date(Date.now() - ttl));
  });
}
