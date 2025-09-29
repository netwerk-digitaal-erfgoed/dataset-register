import { readUrl, ShaclEngineValidator, startInstrumentation, stores } from '@dataset-register/core';
import { server } from './server.js';
import {config} from './config.js';

await (async () => {
  const { datasetStore, registrationStore, allowedRegistrationDomainStore } = stores(
    config.SPARQL_URL,
    config.SPARQL_ACCESS_TOKEN
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
      config.DOCS_URL,
      {
        logger: config.LOG,
        trustProxy: config.TRUST_PROXY,
      },
    );
    await httpServer.listen({port: 3000, host: '0.0.0.0'});
  } catch (err) {
    console.error(err);
  }
})();
