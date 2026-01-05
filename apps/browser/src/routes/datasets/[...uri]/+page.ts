import { fetchDatasetDetail } from '$lib/services/dataset-detail';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params }) => {
  // params.uri from [...uri] rest parameter contains the full path after /datasets/
  // Decode URI components (e.g., %23 -> #) since SvelteKit doesn't auto-decode rest params
  const datasetUri = decodeURIComponent(params.uri);

  if (!datasetUri) {
    error(404, 'Dataset URI is required');
  }

  return fetchDatasetDetail(datasetUri);
};
