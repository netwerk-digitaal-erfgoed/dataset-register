<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { localizeHref } from '$lib/utils/i18n';
  import { exampleQuery } from '$lib/services/sparql-example';

  const sparqlUrl = $derived(
    localizeHref(
      `/query?${new URLSearchParams({
        query: exampleQuery,
        exec: 'true',
      })}`,
    ),
  );
</script>

<a
  href={sparqlUrl}
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
</a>
