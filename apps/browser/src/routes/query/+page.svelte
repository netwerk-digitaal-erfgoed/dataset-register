<script lang="ts">
  import LdForgeEditor from '$lib/components/LdForgeEditor.svelte';
  import * as m from '$lib/paraglide/messages';
  import { getLocale } from '$lib/paraglide/runtime';
  import { localizeHref } from '$lib/utils/i18n';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>SPARQL | Datasetregister</title>
  <meta name="description" content={m.sparql_page_description()} />
</svelte:head>

<div class="mb-6 space-y-3">
  <a
    href={localizeHref('/datasets')}
    class="text-sm text-blue-700 hover:underline dark:text-blue-300"
    >← {m.sparql_back()}</a
  >
  <h1 class="text-3xl font-semibold text-gray-900 dark:text-gray-100">
    SPARQL
  </h1>
  <p class="text-gray-600 dark:text-gray-300">{m.sparql_page_description()}</p>
</div>

<LdForgeEditor query={data.query} autoRun={data.autoRun} locale={getLocale()} />
