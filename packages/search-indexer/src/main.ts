import pino from 'pino';
import { loadConfig } from './config.js';
import { runIndex } from './run-index.js';

/**
 * Standalone entrypoint for a full blue/green rebuild or a manual reindex,
 * runnable as a one-off Job. The crawler triggers {@link runIndex} in-process on
 * each crawl; this CLI exists for rebuilds independent of the crawl schedule.
 */
async function main(): Promise<void> {
  const logger = pino({ name: 'search-indexer' });
  const config = loadConfig();

  const result = await runIndex({
    sparqlUrl: config.SPARQL_URL,
    registrationsGraphIri: config.REGISTRATIONS_GRAPH,
    typesense: {
      host: config.TYPESENSE_HOST,
      port: config.TYPESENSE_PORT,
      protocol: config.TYPESENSE_PROTOCOL,
      apiKey: config.TYPESENSE_API_KEY,
    },
    log: (message) => logger.info(message),
  });

  logger.info(result, 'Search index run complete');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
