<script lang="ts">
  import IndexInformationDialog from './IndexInformationDialog.svelte';
  import type { ForgeEditor } from '@ldforge/editor';
  import type { Locale } from '@ldforge/core';
  import * as m from '$lib/paraglide/messages';

  let {
    query,
    autoRun = false,
    locale,
  }: { query: string; autoRun?: boolean; locale: Locale } = $props();
  let container: HTMLDivElement | undefined = $state();
  let indexOpen = $state(false);
  let loading = $state(true);
  let failed = $state(false);

  $effect(() => {
    const target = container;
    const initialQuery = query;
    const initialLocale = locale;
    const run = autoRun;
    if (!target) return;

    let disposed = false;
    let editor: ForgeEditor | undefined;
    loading = true;
    failed = false;

    // Browser-only and lazy: the editor is not loaded by dataset search pages.
    void import('$lib/services/ldforge')
      .then(({ mountEditor }) => {
        if (disposed) return;
        editor = mountEditor(target, initialQuery, initialLocale, () => {
          indexOpen = true;
        });
        loading = false;
        if (run) void editor.run();
      })
      .catch((error: unknown) => {
        console.error('Failed to load LDForge:', error);
        if (!disposed) {
          loading = false;
          failed = true;
        }
      });

    return () => {
      disposed = true;
      editor?.destroy();
    };
  });
</script>

{#if loading}
  <p role="status" class="py-4 text-gray-600 dark:text-gray-300">
    {m.sparql_loading()}
  </p>
{/if}
{#if failed}
  <p role="alert" class="py-4 text-red-700 dark:text-red-300">
    {m.sparql_load_error()}
  </p>
{/if}
<div
  bind:this={container}
  class="ldforge-host min-w-0"
  aria-label="SPARQL editor"
></div>

<IndexInformationDialog bind:open={indexOpen} {locale} />
