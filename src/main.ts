import {
  GraphDbAllowedRegistrationDomainStore,
  GraphDbClient,
  GraphDbDatasetStore,
  GraphDbRegistrationStore,
} from './graphdb';
import {ShaclValidator} from './validator';
import {Crawler} from './crawler';
import {scheduleJob} from 'node-schedule';
import {server} from './server';

const client = new GraphDbClient(
  process.env.GRAPHDB_URL || 'http://localhost:7200',
  'registry'
);
(async () => {
  if (process.env.GRAPHDB_USERNAME && process.env.GRAPHDB_PASSWORD) {
    await client.authenticate(
      process.env.GRAPHDB_USERNAME,
      process.env.GRAPHDB_PASSWORD
    );
  }

  const datasetStore = new GraphDbDatasetStore(client);
  const registrationStore = new GraphDbRegistrationStore(client);
  const allowedRegistrationDomainStore = new GraphDbAllowedRegistrationDomainStore(
    client
  );
  const crawler = new Crawler(registrationStore, datasetStore);
  const validator = await ShaclValidator.fromUrl('shacl/dataset.jsonld');

  // Schedule crawler to check every hour for CRAWLER_INTERVAL that have expired their REGISTRATION_URL_TTL.
  const ttl = ((process.env.REGISTRATION_URL_TTL || 86400) as number) * 1000;
  if (process.env.CRAWLER_SCHEDULE !== undefined) {
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
      {logger: process.env.LOG ? !!+process.env.LOG : true}
    );
    await httpServer.listen(3000, '0.0.0.0');
  } catch (err) {
    console.error(err);
  }
})();
