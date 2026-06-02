import {
  CompositeValidator,
  DistributionProbeStage,
  readUrl,
  ShaclEngineValidator,
  startInstrumentation,
  stores,
} from '@dataset-register/core';
import { server } from './server.js';
import { config } from './config.js';

await (async () => {
  const {
    datasetStore,
    registrationStore,
    allowedRegistrationDomainStore,
    ratingStore,
  } = stores(config.SPARQL_URL, config.SPARQL_ACCESS_TOKEN);
  startInstrumentation(datasetStore);
  const shacl = await readUrl('requirements/shacl.ttl');
  // Strict mode for the API: any failing distribution probe emits sh:Violation, so a
  // registration with a broken link is rejected synchronously. No health-store state is
  // read or written on this path; the crawler path has its own lenient composite.
  //
  // The probe cap (default 100 distinct endpoints) still applies here, so a registration
  // declaring tens of thousands of distributions is bounded rather than hanging the request;
  // endpoints beyond the cap are not link-checked at submit time. Pass a logger so that
  // truncation is reported rather than silently dropped.
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
    );
    await httpServer.listen({ port: 3000, host: '0.0.0.0' });
  } catch (err) {
    console.error(err);
  }
})();
