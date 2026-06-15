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
import { runIndex } from '@dataset-register/search-indexer';
import { config } from './config.js';

const {
  datasetStore,
  registrationStore,
  ratingStore,
  distributionHealthStore,
  validationReportStore,
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
  validationReportStore,
  validator,
  logger,
  { httpRequestTimeoutMs: config.HTTP_REQUEST_TIMEOUT * 1000 },
);

// Update the Typesense search index after a crawl. Decoupled from the crawl
// write path (it re-reads the store), error-isolated, and skipped entirely when
// no Typesense target is configured — a slow or failed index run must never
// block or crash the crawler (D7).
async function updateSearchIndex(): Promise<void> {
  if (!config.TYPESENSE_HOST || !config.TYPESENSE_API_KEY) {
    return;
  }
  try {
    const result = await runIndex({
      sparqlUrl: config.SPARQL_URL,
      sparqlAccessToken: config.SPARQL_ACCESS_TOKEN,
      typesense: {
        host: config.TYPESENSE_HOST,
        port: config.TYPESENSE_PORT,
        protocol: config.TYPESENSE_PROTOCOL,
        apiKey: config.TYPESENSE_API_KEY,
      },
      log: (message) => logger.info(message),
    });
    logger.info(result, 'Search index updated');
  } catch (error) {
    logger.error({ error }, 'Search index update failed');
  }
}

// Schedule crawler to check every hour for registrations that have expired their REGISTRATION_URL_TTL.
const ttl = config.REGISTRATION_URL_TTL * 1000;
if (config.CRAWLER_SCHEDULE === undefined) {
  await crawler.crawl(new Date(Date.now() - ttl));
  await updateSearchIndex();
} else {
  logger.info(`Crawler scheduled at ${config.CRAWLER_SCHEDULE}`);
  scheduleJob(config.CRAWLER_SCHEDULE, async () => {
    await crawler.crawl(new Date(Date.now() - ttl));
    // Fire-and-forget: do not block the next scheduled crawl on indexing.
    void updateSearchIndex();
  });
}
