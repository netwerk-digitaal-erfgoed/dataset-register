import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { readFile } from 'fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const file = async (filename: string) => {
  const path = join(__dirname, '../test/datasets', filename);
  return await readFile(path, 'utf-8');
};

// Re-export mock stores from mock.ts for convenience
export {
  MockRegistrationStore,
  MockAllowedRegistrationDomainStore,
  MockDatasetStore,
  MockRatingStore,
} from './mock.ts';
