import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { readFile } from 'fs/promises';
import { rdfDereferencer } from 'rdf-dereference';
import type DatasetExt from 'rdf-ext/lib/Dataset.js';
import { pipeline } from 'stream';
import { StandardizeSchemaOrgPrefixToHttps } from './transform.js';
import factory from 'rdf-ext';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const file = async (filename: string) => {
  const path = join(__dirname, '../test/datasets', filename);
  return await readFile(path, 'utf-8');
};

export const validSchemaOrgDataset = () =>
  file('../../../../requirements/examples/dataset-schema-org-valid.jsonld');

export const dereference = async (file: string): Promise<DatasetExt> => {
  const { data } = await rdfDereferencer.dereference(file, {
    localFiles: true,
  });
  const stream = pipeline(
    data,
    new StandardizeSchemaOrgPrefixToHttps(),
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    () => {}, // Noop, just throw errors.
  );
  return await factory.dataset().import(stream);
};

// Re-export mock stores from mock.ts for convenience
export {
  MockRegistrationStore,
  MockAllowedRegistrationDomainStore,
  MockDatasetStore,
  MockRatingStore,
} from './mock.ts';
