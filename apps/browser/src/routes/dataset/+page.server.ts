import { fetchDatasetDetail } from '$lib/services/dataset-detail';
import { cachedFetchAnalysis } from '$lib/services/dataset-analysis-cache.server';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Characters disallowed inside a SPARQL IRIREF (`<...>`): per the grammar, any
// codepoint ≤ U+0020 (space, tab, newline, controls) and the set <>"{}|^`\.
// fetchDatasetDetail interpolates the IRI straight into CONSTRUCT queries, so an
// IRI carrying any of these would produce a syntactically invalid query that
// throws — surfacing as a 500 instead of a clean “not found”. The usual trigger
// is a literal `+` in the IRI shared without percent-encoding: URLSearchParams
// reads `+` as a space (legacy form-encoding), and the original `+` cannot be
// recovered, so 404 is the best achievable outcome.
// eslint-disable-next-line no-control-regex -- matching control codepoints is the point
const ILLEGAL_IRI_CHARS = /[\x00-\x20<>"{}|^`\\]/;

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
