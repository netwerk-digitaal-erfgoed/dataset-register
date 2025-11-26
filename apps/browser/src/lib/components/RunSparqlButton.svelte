<script lang="ts">
  import type { SearchRequest } from '$lib/services/datasets';
  import { datasetCardsQuery } from '$lib/services/datasets';
  import { cleanSparqlQuery } from '$lib/utils/sparql';
  import * as m from '$lib/paraglide/messages';
  import { getLocale } from '$lib/paraglide/runtime';

  interface Props {
    searchRequest: SearchRequest;
  }

  let { searchRequest }: Props = $props();

  const ITEMS_PER_PAGE = 24;

  // Generate SPARQL query from search request
  const query = $derived(
    datasetCardsQuery(searchRequest, ITEMS_PER_PAGE, 0, 'title', getLocale()),
  );

  // Clean and URL encode the query (preserving formatting)
  const sparqlUrl = $derived(() => {
    const cleanedQuery = cleanSparqlQuery(query);
    const encodedQuery = encodeURIComponent(cleanedQuery);
    return `https://qlever-ui.demo.netwerkdigitaalerfgoed.nl/?query=${encodedQuery}&exec=true`;
  });
</script>

<a
  href={sparqlUrl()}
  target="_blank"
  rel="noopener noreferrer"
  class="group relative inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 border border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
>
  <div
    class="invisible absolute bottom-full left-1/2 mb-2 -translate-x-1/2 transform rounded bg-gray-800 px-2 py-1 text-xs whitespace-nowrap text-white opacity-0 transition-opacity duration-200 group-hover:visible group-hover:opacity-100"
  >
    {m.sparql_view_query()}
    <div
      class="absolute top-full left-1/2 h-0 w-0 -translate-x-1/2 border-t-4 border-r-4 border-l-4 border-t-gray-800 border-r-transparent border-l-transparent"
    ></div>
  </div>
  SPARQL
  <svg
    class="w-3 h-3"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
    />
  </svg>
</a>
