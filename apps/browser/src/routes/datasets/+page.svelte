<script lang="ts">
  import DatasetCard from '$lib/components/DatasetCard.svelte';
  import SearchFacet from '$lib/components/SearchFacet.svelte';
  import ActiveFilters from '$lib/components/ActiveFilters.svelte';
  import RunSparqlButton from '$lib/components/RunSparqlButton.svelte';
  import * as m from '$lib/paraglide/messages';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import type {
    DatasetCard as DatasetCardType,
    SearchRequest,
    SearchResults,
  } from '$lib/services/datasets';
  import { fetchDatasets } from '$lib/services/datasets';
  import type { FacetValue } from '$lib/services/facets';
  import type { Facets } from '$lib/services/datasets';

  // Derive searchRequest from URL, which is the single source of truth.
  let searchRequest: SearchRequest = $derived({
    query: page.url.searchParams.get('search') || undefined,
    publisher:
      page.url.searchParams.get('publishers')?.split(',').filter(Boolean) || [],
    format:
      page.url.searchParams.get('format')?.split(',').filter(Boolean) || [],
  });

  let searchResults: SearchResults | undefined = $state();

  // Writable derived - reads from URL, can be written to for local updates
  let localQuery = $derived(searchRequest.query || '');

  // Cache facets to keep them visible during loading
  let cachedFacets = $state<Facets | undefined>();

  let selectedValues: {
    publisher: FacetValue[];
    format: FacetValue[];
  } = $derived({
    publisher: searchRequest.publisher.map((value) => {
      // Try current search results first, then cached facets
      const facet =
        searchResults?.facets.publisher.find(
          (publisher) => publisher.value === value,
        ) ??
        cachedFacets?.publisher.find((publisher) => publisher.value === value);
      return {
        value,
        label: facet?.label || { '': value },
      };
    }),
    format: searchRequest.format.map((value) => {
      return {
        value,
      };
    }),
  });

  let debounceTimer: ReturnType<typeof setTimeout>;
  let inputElement = $state<HTMLInputElement>();
  let facetsLoaded = $state(false);

  // Infinite scroll state
  let accumulatedDatasets = $state<DatasetCardType[]>([]);
  let currentOffset = $state(0);
  let isLoadingMore = $state(false);
  let hasMore = $state(true);
  let sentinelElement = $state<HTMLDivElement>();
  let observer: IntersectionObserver;

  const ITEMS_PER_PAGE = 24;

  // Single function to update URL - called from all user interactions
  function updateURL(params: {
    query?: string;
    publisher?: string[];
    format?: string[];
  }) {
    const url = new URL(window.location.href);

    if (params.query) {
      url.searchParams.set('search', params.query);
    } else {
      url.searchParams.delete('search');
    }

    if (params.publisher && params.publisher.length > 0) {
      url.searchParams.set('publishers', params.publisher.join(','));
    } else {
      url.searchParams.delete('publishers');
    }

    if (params.format && params.format.length > 0) {
      url.searchParams.set('format', params.format.join(','));
    } else {
      url.searchParams.delete('format');
    }

    goto(url, {
      noScroll: true,
      replaceState: true,
      keepFocus: true,
    });
  }

  // Watch localQuery writes and debounce URL updates
  $effect(() => {
    const query = localQuery;

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      updateURL({
        query: query || undefined,
        publisher: searchRequest.publisher,
        format: searchRequest.format,
      });
    }, 600);
  });

  // Watch searchRequest (derived from URL) and fetch data
  $effect(() => {
    const request = searchRequest;

    // Clear results to trigger loading state
    searchResults = undefined;

    fetchDatasets(request, ITEMS_PER_PAGE, 0).then((results) => {
      searchResults = results;
      accumulatedDatasets = [...results.datasets];
      currentOffset = results.datasets.length;
      hasMore = currentOffset < results.total;

      if (!facetsLoaded) {
        facetsLoaded = true;
      }
    });
  });

  // Cache facets whenever search results update
  $effect(() => {
    if (searchResults) {
      cachedFacets = searchResults.facets;
    }
  });

  // Load more datasets
  async function loadMore() {
    if (isLoadingMore || !hasMore) return;

    isLoadingMore = true;
    try {
      searchResults = await fetchDatasets(
        searchRequest,
        ITEMS_PER_PAGE,
        currentOffset,
      );

      accumulatedDatasets = [...accumulatedDatasets, ...searchResults.datasets];
      currentOffset += searchResults.datasets.length;
      hasMore = accumulatedDatasets.length < searchResults.total;
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
  <meta content={m.header_tagline()} name="description" />
</svelte:head>

<div class="max-w-7xl mx-auto px-8 py-8 font-sans">
  <input
    bind:this={inputElement}
    bind:value={localQuery}
    class="w-full px-6 py-4 text-lg border-2 border-gray-300 dark:border-gray-600 rounded-lg mb-8 transition-colors focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 placeholder:text-gray-400 dark:placeholder:text-gray-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
    placeholder={m.search_placeholder()}
    type="search"
  />

  {#if cachedFacets}
    <ActiveFilters
      {selectedValues}
      onRemove={(type, value) => {
        if (type === 'publisher') {
          const newPublishers = searchRequest.publisher.filter(
            (p) => p !== value,
          );
          updateURL({
            query: searchRequest.query,
            publisher: newPublishers,
            format: searchRequest.format,
          });
        } else if (type === 'format') {
          const newFormats = searchRequest.format.filter((f) => f !== value);
          updateURL({
            query: searchRequest.query,
            publisher: searchRequest.publisher,
            format: newFormats,
          });
        }
      }}
    />
  {/if}

  <div class="flex gap-8">
    <!-- Sidebar with facets - outside await block to prevent re-rendering -->
    <aside class="w-64 flex-shrink-0">
      {#if !facetsLoaded}
        <div
          class="h-6 bg-gradient-to-r from-gray-300 to-gray-200 dark:from-gray-700 dark:to-gray-600 rounded mb-3 w-3/4 animate-shimmer"
        ></div>
      {:else}
        {#if (searchResults?.facets.publisher ?? cachedFacets?.publisher ?? []).length > 0 || searchRequest.publisher.length > 0}
          <SearchFacet
            selectedValues={searchRequest.publisher}
            values={searchResults?.facets.publisher ??
              cachedFacets?.publisher ??
              []}
            title={m.facets_publisher()}
            onChange={(newPublishers) => {
              updateURL({
                query: searchRequest.query,
                publisher: newPublishers,
                format: searchRequest.format,
              });
            }}
          />
        {/if}
        {#if (searchResults?.facets.format ?? cachedFacets?.format ?? []).length > 0 || searchRequest.format.length > 0}
          <SearchFacet
            selectedValues={searchRequest.format}
            values={searchResults?.facets.format ?? cachedFacets?.format ?? []}
            title={m.facets_format()}
            onChange={(newFormats) => {
              updateURL({
                query: searchRequest.query,
                publisher: searchRequest.publisher,
                format: newFormats,
              });
            }}
          />
        {/if}
      {/if}
    </aside>

    <!-- Main content area -->
    <div class="flex-1 min-w-0">
      {#if !searchResults}
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
      {:else}
        <div class="mb-6 flex items-center justify-between">
          <p
            class="text-gray-600 dark:text-gray-400 text-sm font-medium"
            class:invisible={searchResults.total === 0}
          >
            {m.search_datasets_found({ count: searchResults.total })} (in {Math.round(
              searchResults.time,
            )} ms)
          </p>
          <RunSparqlButton {searchRequest} />
        </div>

        {#if searchResults.datasets.length === 0}
          <!-- No results -->
          <p class="text-center text-gray-600 dark:text-gray-400 py-12 text-lg">
            {m.search_no_datasets()}
          </p>
        {:else}
          <!-- Success state: show accumulated datasets -->
          <div
            class="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-6"
          >
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
      {/if}
    </div>
  </div>
</div>

<style>
  /* Make the clear button (X) in search input show pointer cursor */
  input[type='search']::-webkit-search-cancel-button {
    cursor: pointer;
  }
</style>
