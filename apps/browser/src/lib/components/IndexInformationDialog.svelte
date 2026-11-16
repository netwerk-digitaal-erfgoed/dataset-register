<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { PUBLIC_SPARQL_ENDPOINT } from '$app/env/public';
  import {
    fetchIndexStatistics,
    type IndexStatistics,
  } from '$lib/services/index-statistics';

  let { open = $bindable(false), locale }: { open?: boolean; locale: string } =
    $props();
  let dialog: HTMLDialogElement | undefined = $state();
  let statistics: IndexStatistics | undefined = $state();
  let failed = $state(false);
  let retry = $state(0);
  const format = $derived(new Intl.NumberFormat(locale));

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  });

  $effect(() => {
    if (!open) return;
    void retry;
    statistics = undefined;
    failed = false;
    const controller = new AbortController();
    void fetchIndexStatistics(PUBLIC_SPARQL_ENDPOINT, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) statistics = value;
      })
      .catch(() => {
        if (!controller.signal.aborted) failed = true;
      });
    return () => controller.abort();
  });
</script>

<dialog
  bind:this={dialog}
  onclose={() => (open = false)}
  aria-labelledby="index-information-title"
  class="m-auto w-[min(92vw,38rem)] max-h-[85vh] rounded-xl border border-gray-200 bg-white p-0 text-gray-900 shadow-xl backdrop:bg-black/40 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
>
  <div
    class="flex items-center justify-between gap-6 border-b border-gray-200 px-6 py-4 dark:border-gray-700"
  >
    <h2 id="index-information-title" class="text-xl font-semibold">
      {m.index_information()}
    </h2>
    <button
      type="button"
      onclick={() => (open = false)}
      class="rounded-md px-3 py-1.5 text-sm hover:bg-gray-100 focus-visible:outline-2 dark:hover:bg-gray-800"
      >{m.index_close()}</button
    >
  </div>
  <div class="p-6">
    {#if failed}
      <p role="alert" class="mb-4 text-red-700 dark:text-red-300">
        {m.index_error()}
      </p>
      <button
        type="button"
        onclick={() => retry++}
        class="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600"
        >{m.index_retry()}</button
      >
    {:else if statistics}
      <dl>
        <div class="mb-4 border-b border-gray-200 pb-4 dark:border-gray-700">
          <dt class="mb-1 text-sm text-gray-500 dark:text-gray-400">
            {m.index_description()}
          </dt>
          <dd class="text-lg font-semibold">
            {statistics.name || PUBLIC_SPARQL_ENDPOINT}
          </dd>
        </div>
        {#each [{ label: m.index_triples(), value: statistics.triples }, { label: m.index_subjects(), value: statistics.subjects }, { label: m.index_predicates(), value: statistics.predicates }, { label: m.index_objects(), value: statistics.objects }] as item (item.label)}
          <div class="flex items-center justify-between gap-6 py-2">
            <dt class="text-gray-600 dark:text-gray-300">{item.label}</dt>
            <dd class="font-semibold tabular-nums">
              {format.format(item.value)}
            </dd>
          </div>
        {/each}
      </dl>
    {:else}
      <p role="status" class="py-4 text-gray-600 dark:text-gray-300">
        {m.index_loading()}
      </p>
    {/if}
    <a
      href={PUBLIC_SPARQL_ENDPOINT}
      class="mt-6 block break-all text-xs text-gray-500 underline dark:text-gray-400"
      >{PUBLIC_SPARQL_ENDPOINT}</a
    >
  </div>
</dialog>
