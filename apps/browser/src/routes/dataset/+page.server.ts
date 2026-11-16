import { fetchDatasetDetail } from '$lib/services/dataset-detail';
import { ILLEGAL_IRI_CHARS } from '$lib/utils/sparql';
import { cachedFetchAnalysis } from '$lib/services/dataset-analysis-cache.server';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
  const datasetUri = url.searchParams.get('uri');

  if (!datasetUri) {
    error(400, 'Missing required query parameter: uri');
  }

  if (ILLEGAL_IRI_CHARS.test(datasetUri)) {
    error(404, 'Dataset not found');
  }

  // Serve the Knowledge Graph analysis from the Valkey cache when warm; the
  // register queries still run per request (they are fast), only the slow,
  // low-churn analysis is cached.
  return fetchDatasetDetail(datasetUri, cachedFetchAnalysis);
};
