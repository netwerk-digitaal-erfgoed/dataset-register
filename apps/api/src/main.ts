import { readUrl, ShaclEngineValidator, startInstrumentation, stores } from '@dataset-register/core';

import { server } from './server.js';

await (async () => {
  const { datasetStore, registrationStore, allowedRegistrationDomainStore } = stores(
    process.env.SPARQL_URL || 'http://127.0.0.1:7001',
    process.env.SPARQL_ACCESS_TOKEN
  );
  startInstrumentation(datasetStore);
  const shacl = await readUrl('requirements/shacl.ttl');
  const validator = new ShaclEngineValidator(shacl);

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
      },
    );
    await httpServer.listen({port: 3000, host: '0.0.0.0'});
  } catch (err) {
    console.error(err);
  }
})();
