import {
  GraphDbAllowedRegistrationDomainStore,
  GraphDbClient,
  GraphDbDatasetStore,
  GraphDbRegistrationStore,
} from './graphdb';
import {readUrl, ShaclValidator} from './validator';
import {Crawler} from './crawler';
import {scheduleJob} from 'node-schedule';
import {server} from './server';
import Pino from 'pino';

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
  const allowedRegistrationDomainStore =
    new GraphDbAllowedRegistrationDomainStore(client);
  const shacl = await readUrl('shacl/register.ttl');
  const validator = new ShaclValidator(shacl);
  const crawler = new Crawler(
    registrationStore,
    datasetStore,
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
      {logger: process.env.LOG ? !!+process.env.LOG : true}
    );
    await httpServer.listen({port: 3000, host: '0.0.0.0'});
  } catch (err) {
    console.error(err);
  }
})();
