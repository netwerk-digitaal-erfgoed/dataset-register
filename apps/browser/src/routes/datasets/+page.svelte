<script lang="ts">
  import DatasetCard from '$lib/components/DatasetCard.svelte';
  import * as m from '$lib/paraglide/messages';
  import type { PageData } from './$types';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import type { DatasetCard as DatasetCardType } from '$lib/services/datasets';
  import { fetchDatasets } from '$lib/services/datasets';

  let { data }: { data: PageData } = $props();

  let searchValue = $state(page.url.searchParams.get('search') || '');
  let debounceTimer: ReturnType<typeof setTimeout>;
  let inputElement = $state<HTMLInputElement>();

  // Infinite scroll state
  let accumulatedDatasets = $state<DatasetCardType[]>([]);
  let currentOffset = $state(0);
  let isLoadingMore = $state(false);
  let hasMore = $state(true);
  let totalCount = $state(0);
  let sentinelElement = $state<HTMLDivElement>();
  let observer: IntersectionObserver;

  const ITEMS_PER_PAGE = 24;

  function handleSearch(event: Event) {
    const input = event.target as HTMLInputElement;
    searchValue = input.value;

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      // Update URL without reloading
      const url = new URL(page.url);
      if (searchValue) {
        url.searchParams.set('search', searchValue);
      } else {
        url.searchParams.delete('search');
      }

      await goto(url, {
        noScroll: true,
        replaceState: true,
        keepFocus: true,
      });

      // Manually fetch and update results
      const searchParam = searchValue || undefined;
      const result = await fetchDatasets(ITEMS_PER_PAGE, searchParam, 0);
      accumulatedDatasets = [...result.results];
      currentOffset = result.results.length;
      totalCount = result.total;
      hasMore = result.results.length < result.total;
    }, 600);
  }

  // Initialize with data when promise resolves
  $effect(() => {
    data.datasets.then((datasets) => {
      accumulatedDatasets = [...datasets.results];
      currentOffset = datasets.results.length;
      totalCount = datasets.total;
      hasMore = datasets.results.length < datasets.total;
    });
  });

  // Load more datasets
  async function loadMore() {
    if (isLoadingMore || !hasMore) return;

    isLoadingMore = true;
    try {
      const searchParam = page.url.searchParams.get('search') || undefined;
      const result = await fetchDatasets(
        ITEMS_PER_PAGE,
        searchParam,
        currentOffset,
      );

      accumulatedDatasets = [...accumulatedDatasets, ...result.results];
      currentOffset += result.results.length;
      hasMore = accumulatedDatasets.length < totalCount;
    } catch (error) {
      console.error('Failed to load more datasets:', error);
    } finally {
      isLoadingMore = false;
    }
  }

  // Focus search input on mount
  $effect(() => {
    if (inputElement) {
      inputElement.focus();
    }
  });

  // Setup IntersectionObserver - re-runs when sentinelElement changes
  $effect(() => {
    if (!sentinelElement) return;

    observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(sentinelElement);

    return () => {
      observer?.disconnect();
    };
  });

  // Function to create skeleton placeholders
  function createSkeletons(count: number) {
    return Array.from({ length: count }, (_, i) => i);
  }
</script>

<svelte:head>
  <title>Datasets - Netwerk Digitaal Erfgoed</title>
  <meta
    content="Discover datasets from the Dutch heritage network"
    name="description"
  />
</svelte:head>

<div class="max-w-7xl mx-auto px-8 py-8 font-sans">
  <input
    bind:this={inputElement}
    bind:value={searchValue}
    class="w-full px-6 py-4 text-lg border-2 border-gray-300 dark:border-gray-600 rounded-lg mb-8 transition-colors focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 placeholder:text-gray-400 dark:placeholder:text-gray-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
    oninput={handleSearch}
    placeholder={m['search.search_placeholder']()}
    type="search"
  />

  {#await data.datasets}
    <!-- Loading state -->
    <div class="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-6">
      {#each createSkeletons(6) as skeletonId (skeletonId)}
        <div
          class="border border-gray-200 dark:border-gray-700 rounded-lg p-6 bg-gray-50 dark:bg-gray-800 pointer-events-none"
        >
          <div
            class="h-7 bg-gradient-to-r from-gray-300 to-gray-200 dark:from-gray-700 dark:to-gray-600 rounded mb-4 w-4/5 animate-shimmer"
          ></div>
          <div
            class="h-4 bg-gradient-to-r from-gray-300 to-gray-200 dark:from-gray-700 dark:to-gray-600 rounded mb-2.5 animate-shimmer"
          ></div>
          <div
            class="h-4 bg-gradient-to-r from-gray-300 to-gray-200 dark:from-gray-700 dark:to-gray-600 rounded w-3/5 animate-shimmer"
          ></div>
        </div>
      {/each}
    </div>
  {:then datasets}
    <!-- Total count -->
    <p
      class="mb-6 text-gray-600 dark:text-gray-400 text-sm font-medium"
      class:invisible={datasets.total === 0}
    >
      {m['search.datasets_found']({ count: datasets.total })} (in {Math.round(
        datasets.time,
      )} ms)
    </p>

    {#if datasets.results.length === 0}
      <!-- No results -->
      <p class="text-center text-gray-600 dark:text-gray-400 py-12 text-lg">
        {m['search.no_datasets']()}
      </p>
    {:else}
      <!-- Success state: show accumulated datasets -->
      <div class="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-6">
        {#each accumulatedDatasets as dataset (dataset.$id)}
          <DatasetCard {dataset} />
        {/each}
      </div>

      <!-- Infinite scroll sentinel -->
      <div bind:this={sentinelElement} class="py-8 text-center">
        {#if isLoadingMore}
          <p class="text-gray-600 dark:text-gray-400 text-sm">
            {m.loading_more()}
          </p>
        {/if}
      </div>
    {/if}
  {:catch error}
    <!-- Error state -->
    <p class="text-center text-red-600 dark:text-red-400 py-12">
      Error loading datasets: {error.message}
    </p>
  {/await}
</div>

<style>
  /* Make the clear button (X) in search input show pointer cursor */
  input[type='search']::-webkit-search-cancel-button {
    cursor: pointer;
  }
</style>
