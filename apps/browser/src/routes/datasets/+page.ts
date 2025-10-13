import { fetchDatasets } from '$lib/services/datasets';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ url }) => {
  const limit = 99;
  const search = url.searchParams.get('search') || undefined;

  return {
    datasets: fetchDatasets(limit, search), // Return promise for streaming
  };
};
