import fs from 'fs';

export const file = async (filename: string) =>
  await fs.promises.readFile(`test/datasets/${filename}`, 'utf-8');
