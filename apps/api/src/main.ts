import {
  GraphDbAllowedRegistrationDomainStore,
  GraphDbClient,
  GraphDbDatasetStore,
  GraphDbRegistrationStore,
  readUrl,
  ShaclValidator,
  startInstrumentation
} from '@dataset-register/core';
import { server } from './server.js';

const client = new GraphDbClient(
  process.env.GRAPHDB_URL || 'http://127.0.0.1:7200',
  'registry',
);
await (async () => {
  if (process.env.GRAPHDB_USERNAME && process.env.GRAPHDB_PASSWORD) {
    await client.authenticate(
      process.env.GRAPHDB_USERNAME,
      process.env.GRAPHDB_PASSWORD,
    );
  }

  const datasetStore = new GraphDbDatasetStore(client);
  const registrationStore = new GraphDbRegistrationStore(client);
  const allowedRegistrationDomainStore =
    new GraphDbAllowedRegistrationDomainStore(client);
  startInstrumentation(datasetStore);
  const shacl = await readUrl('spec/shacl.ttl');
  const validator = new ShaclValidator(shacl);

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
