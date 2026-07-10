import { Crawler } from './crawler.js';
import {
  CompositeValidator,
  DistributionProbeStage,
  readProbeSeverities,
  readUrl,
  ShaclEngineValidator,
  shutdownInstrumentation,
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
  distributionValidityStore,
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
    validityStore: distributionValidityStore,
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
// block or crash the crawler (D7). The rebuild is single-flight per index inside
// the indexer, so the crawler and the API pods never rebuild concurrently.
async function updateSearchIndex(): Promise<void> {
  if (!config.TYPESENSE_HOST || !config.TYPESENSE_API_KEY) {
    return;
  }
  try {
    await runIndex({
      sparqlUrl: config.SPARQL_URL,
      knowledgeGraphEndpoint: config.KNOWLEDGE_GRAPH_URL,
      typesense: {
        host: config.TYPESENSE_HOST,
        port: config.TYPESENSE_PORT,
        protocol: config.TYPESENSE_PROTOCOL,
        apiKey: config.TYPESENSE_API_KEY,
      },
      log: (message) => logger.info(message),
    });
    logger.info('Search index update finished');
  } catch (error) {
    logger.error({ error }, 'Search index update failed');
  }
}

// One-shot: crawl every registration whose REGISTRATION_URL_TTL has expired,
// rebuild the search index, flush metrics, then exit. Recurring crawls are
// scheduled externally (a k8s CronJob), which owns overlap prevention: two
// rounds can never run concurrently in one process because the process is gone
// between rounds.
const ttl = config.REGISTRATION_URL_TTL * 1000;

// Flush metrics on SIGTERM so a watchdog-terminated pod (activeDeadlineSeconds)
// still ships what it recorded. Kubernetes sends SIGTERM before SIGKILL.
process.on('SIGTERM', () => {
  void shutdownInstrumentation().finally(() => process.exit(143));
});

logger.info('Starting crawl');
await crawler.crawl(new Date(Date.now() - ttl));
await updateSearchIndex();
await shutdownInstrumentation();
logger.info('Crawl finished');
