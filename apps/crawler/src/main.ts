import { scheduleJob } from 'node-schedule';
import { Crawler } from './crawler.js';
import {
  GraphDbClient,
  GraphDbDatasetStore,
  GraphDbRatingStore,
  GraphDbRegistrationStore, readUrl,
  ShaclValidator
} from '@dataset-register/core';
import pino from 'pino';

const client = new GraphDbClient(
  process.env.GRAPHDB_URL || 'http://127.0.0.1:7200',
  'registry',
);
await (async () => {
  if (process.env.GRAPHDB_USERNAME && process.env.GRAPHDB_PASSWORD) {
    await client.authenticate(
      process.env.GRAPHDB_USERNAME,
      process.env.GRAPHDB_PASSWORD,
    );
  }
});

const shacl = await readUrl('requirements/shacl.ttl');
const registrationStore = new GraphDbRegistrationStore(client);
const datasetStore = new GraphDbDatasetStore(client);
const ratingStore = new GraphDbRatingStore(client);
const logger = pino();
const validator = new ShaclValidator(shacl);

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
