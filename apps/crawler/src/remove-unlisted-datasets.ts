import { DatasetRemover, stores } from '@dataset-register/core';
import { config } from './config.js';

// One-off backfill: remove the stored datasets that no registration lists, left behind
// by crawls that replaced a registration’s datasets before they were removed on the
// way. Lists them without removing anything unless passed `--apply`.
//
//   SPARQL_URL=… SPARQL_ACCESS_TOKEN=… node apps/crawler/dist/remove-unlisted-datasets.js [--apply]
const dryRun = !process.argv.includes('--apply');

const remover = new DatasetRemover(
  stores(config.SPARQL_URL, config.SPARQL_ACCESS_TOKEN),
);
const removed = await remover.removeUnlisted({ dryRun });

for (const datasetIri of removed) {
  console.log(datasetIri.toString());
}
console.log(
  `${dryRun ? 'Would remove' : 'Removed'} ${removed.length} datasets that no registration lists`,
);
