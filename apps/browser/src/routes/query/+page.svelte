<script lang="ts">
  import LdForgeEditor from '$lib/components/LdForgeEditor.svelte';
  import * as m from '$lib/paraglide/messages';
  import { getLocale } from '$lib/paraglide/runtime';
  import { localizeHref } from '$lib/utils/i18n';
  import { datasetDetailHref } from '$lib/url';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>SPARQL | Datasetregister</title>
  <meta name="description" content={m.sparql_page_description()} />
</svelte:head>

<div class="mx-auto max-w-7xl px-1 sm:px-6 lg:px-8">
  <div class="mb-8">
    <a
      href={localizeHref(
        data.target ? datasetDetailHref(data.target.dataset) : '/datasets',
      )}
      class="mb-4 inline-block text-sm text-blue-700 hover:underline dark:text-blue-400"
      >← {data.target ? m.sparql_back_to_dataset() : m.sparql_back()}</a
    >
    <h1
      class="mb-4 text-3xl font-bold leading-[1.2] tracking-[-0.02em] text-gray-900 dark:text-white lg:text-4xl"
    >
      SPARQL
    </h1>
    <p class="text-[0.9375rem] leading-[1.5] text-gray-700 dark:text-gray-300">
      {#if data.target}
        {m.sparql_dataset_endpoint_description()}
        <code class="break-all">{data.target.endpoint}</code>
      {:else}
        {m.sparql_page_description()}
      {/if}
    </p>
  </div>

  <LdForgeEditor
    query={data.query}
    autoRun={data.autoRun}
    locale={getLocale()}
    endpoint={data.target?.endpoint}
  />
</div>
