import {
  CompositeValidator,
  DistributionProbeStage,
  readUrl,
  ShaclEngineValidator,
  startInstrumentation,
  stores,
} from '@dataset-register/core';
import { runIndex } from '@dataset-register/search-indexer';
import { server } from './server.js';
import { config } from './config.js';

// Build the fire-and-forget search-index trigger handed to the server. Returns
// undefined when no Typesense target is configured, so the API runs unchanged
// without a search deployment. The rebuild is single-flight per index inside the
// indexer, shared with the crawler and the other API replica.
function buildSearchIndexTrigger(): (() => void) | undefined {
  if (!config.TYPESENSE_HOST || !config.TYPESENSE_API_KEY) {
    return undefined;
  }
  const typesense = {
    host: config.TYPESENSE_HOST,
    port: config.TYPESENSE_PORT,
    protocol: config.TYPESENSE_PROTOCOL,
    apiKey: config.TYPESENSE_API_KEY,
  };
  return () => {
    void runIndex({
      sparqlUrl: config.SPARQL_URL,
      sparqlAccessToken: config.SPARQL_ACCESS_TOKEN,
      knowledgeGraphEndpoint: config.KNOWLEDGE_GRAPH_URL,
      typesense,
      log: (message) => console.log(message),
    }).catch((error) => console.error('Search index update failed', error));
  };
}

await (async () => {
  const {
    datasetStore,
    registrationStore,
    allowedRegistrationDomainStore,
    ratingStore,
  } = stores(config.SPARQL_URL, config.SPARQL_ACCESS_TOKEN);
  startInstrumentation(datasetStore);
  const shacl = await readUrl('requirements/shacl.ttl');
  // Strict mode for the API. The DistributionProbeStage omits `severities`, so it falls back to
  // emitting every probe failure at sh:Violation regardless of the shapes' declared severity:
  // a faulty distribution invalidates the dataset, so it is rejected at registration and shown
  // as invalid on the /validate endpoints. The crawler honours the shapes' sh:Warning instead,
  // so a distribution that breaks after a dataset is registered is reported without invalidating
  // it. No health-store state is read or written on this path; the crawler has its own composite.
  //
  // The probe cap (default 100 distinct endpoints) still applies, so a registration declaring
  // tens of thousands of distributions is bounded rather than hanging the request; endpoints
  // beyond the cap are not link-checked at submit time. Pass a logger so that truncation is
  // reported rather than silently dropped.
  const validator = new CompositeValidator(
    new ShaclEngineValidator(shacl),
    new DistributionProbeStage({
      logger: config.LOG ? { warn: (message) => console.warn(message) } : null,
    }),
  );

  try {
    // Start web server.
    const httpServer = await server(
      datasetStore,
      registrationStore,
      allowedRegistrationDomainStore,
      validator,
      shacl,
      config.DOCS_URL,
      {
        logger: config.LOG,
        trustProxy: config.TRUST_PROXY,
      },
      ratingStore,
      config.API_ACCESS_TOKEN,
      buildSearchIndexTrigger(),
    );
    await httpServer.listen({ port: 3000, host: '0.0.0.0' });
  } catch (err) {
    console.error(err);
  }
})();
