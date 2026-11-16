import { error } from '@sveltejs/kit';
import { isDatasetSparqlEndpoint } from '$lib/services/dataset-detail';
import type { PageServerLoad } from './$types';

// The editor only queries a dataset’s own endpoint when the register lists it
// as one of that dataset’s SPARQL distributions, so a crafted link cannot point
// the page at an arbitrary server.
export const load: PageServerLoad = async ({ url }) => {
  const dataset = url.searchParams.get('dataset');
  const endpoint = url.searchParams.get('endpoint');
  if (dataset === null && endpoint === null) return { target: undefined };
  if (
    dataset === null ||
    endpoint === null ||
    !(await isDatasetSparqlEndpoint(dataset, endpoint))
  ) {
    error(404, 'SPARQL endpoint not found for this dataset');
  }
  return { target: { dataset, endpoint } };
};
