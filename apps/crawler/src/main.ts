import { scheduleJob } from 'node-schedule';
import { Crawler } from './crawler.js';
import { readUrl, ShaclEngineValidator, stores } from '@dataset-register/core';
import pino from 'pino';

const { datasetStore, registrationStore, ratingStore } = stores(
  process.env.SPARQL_URL || 'http://127.0.0.1:7001',
  process.env.SPARQL_ACCESS_TOKEN
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

// Schedule crawler to check every hour for CRAWLER_INTERVAL that have expired their REGISTRATION_URL_TTL.
const ttl = ((process.env.REGISTRATION_URL_TTL || 86400) as number) * 1000;
if (process.env.CRAWLER_SCHEDULE !== undefined) {
  logger.info(`Crawler scheduled at ${process.env.CRAWLER_SCHEDULE}`);
  scheduleJob(process.env.CRAWLER_SCHEDULE, async () => {
    await crawler.crawl(new Date(Date.now() - ttl));
  });
}
