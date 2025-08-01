import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
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
} from './mock.js';
