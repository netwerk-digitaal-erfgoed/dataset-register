import { fetchDatasetDetail } from '$lib/services/dataset-detail';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, fetch }) => {
  // params.uri from [...uri] rest parameter contains the full path after /datasets/
  const datasetUri = params.uri;

  if (!datasetUri) {
    error(404, 'Dataset URI is required');
  }

  return fetchDatasetDetail(datasetUri, fetch);
};
