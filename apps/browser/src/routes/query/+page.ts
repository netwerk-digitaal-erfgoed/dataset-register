import { exampleQuery } from '$lib/services/sparql-example';
import type { PageLoad } from './$types';

// A neutral starter query for a dataset’s own endpoint, whose data we do not know.
const datasetStarterQuery = `SELECT * WHERE {
  ?subject ?predicate ?object .
}
LIMIT 10`;

export const load: PageLoad = ({ url, data }) => ({
  ...data,
  query:
    url.searchParams.get('query') ??
    (data.target ? datasetStarterQuery : exampleQuery),
  // Never run on load against a dataset’s endpoint: a shared link could
  // otherwise fire any query at an institution’s server from every visitor.
  autoRun: !data.target && url.searchParams.get('exec') === 'true',
});
