import { exampleQuery } from '$lib/services/sparql-example';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ url }) => ({
  query: url.searchParams.get('query') ?? exampleQuery,
  autoRun: url.searchParams.get('exec') === 'true',
});
