import { fetchDatasetDetail } from '$lib/services/dataset-detail';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
  const datasetUri = url.searchParams.get('uri');

  if (!datasetUri) {
    error(400, 'Missing required query parameter: uri');
  }

  return fetchDatasetDetail(datasetUri);
};
