import {
  GraphDbAllowedRegistrationDomainStore,
  GraphDbClient,
  GraphDbDatasetStore,
  GraphDbRatingStore,
  GraphDbRegistrationStore,
} from './graphdb.js';
import {readUrl, ShaclValidator} from './validator.js';
import {Crawler} from './crawler.js';
import {scheduleJob} from 'node-schedule';
import {server} from './server.js';
import Pino from 'pino';
import {startInstrumentation} from './instrumentation.js';

const client = new GraphDbClient(
  process.env.GRAPHDB_URL || 'http://127.0.0.1:7200',
  'registry'
);
(async () => {
  if (process.env.GRAPHDB_USERNAME && process.env.GRAPHDB_PASSWORD) {
    await client.authenticate(
      process.env.GRAPHDB_USERNAME,
      process.env.GRAPHDB_PASSWORD
    );
  }

  const logger = Pino();
  const datasetStore = new GraphDbDatasetStore(client);
  const registrationStore = new GraphDbRegistrationStore(client);
  const ratingStore = new GraphDbRatingStore(client);
  const allowedRegistrationDomainStore =
    new GraphDbAllowedRegistrationDomainStore(client);
  await startInstrumentation(datasetStore);
  const shacl = await readUrl('shacl/register.ttl');
  const validator = new ShaclValidator(shacl);
  const crawler = new Crawler(
    registrationStore,
    datasetStore,
    ratingStore,
    validator,
    logger
  );

  // Schedule crawler to check every hour for CRAWLER_INTERVAL that have expired their REGISTRATION_URL_TTL.
  const ttl = ((process.env.REGISTRATION_URL_TTL || 86400) as number) * 1000;
  if (process.env.CRAWLER_SCHEDULE !== undefined) {
    logger.info(`Crawler scheduled at ${process.env.CRAWLER_SCHEDULE}`);
    scheduleJob(process.env.CRAWLER_SCHEDULE, () => {
      crawler.crawl(new Date(Date.now() - ttl));
    });
  }

  try {
    // Start web server.
    const httpServer = await server(
      datasetStore,
      registrationStore,
      allowedRegistrationDomainStore,
      validator,
      shacl,
      process.env.DOCS_URL || undefined,
      {
        logger: process.env.LOG !== 'false',
        trustProxy: process.env.TRUST_PROXY === 'true',
      }
    );
    await httpServer.listen({port: 3000, host: '0.0.0.0'});
  } catch (err) {
    console.error(err);
  }
})();
