<script lang="ts" module>
  import type {
    DatasetCard as DatasetCardType,
    SearchRequest,
    SearchResults,
  } from '$lib/services/datasets';
  import type { Facets } from '$lib/services/facets';

  // Cache interface for preserving search state across navigation
  interface SearchCache {
    datasets: DatasetCardType[];
    offset: number;
    scrollY: number;
    total: number;
    facets: Facets;
    searchKey: string;
    time: number;
  }

  // Module-level cache that persists across component instances
  let searchCache: SearchCache | null = null;

  function getSearchKey(request: SearchRequest): string {
    return JSON.stringify(request);
  }
</script>

<script lang="ts">
  import DatasetCard from '$lib/components/DatasetCard.svelte';
  import FacetsPanel from '$lib/components/FacetsPanel.svelte';
  import ActiveFilters from '$lib/components/ActiveFilters.svelte';
  import RunSparqlButton from '$lib/components/RunSparqlButton.svelte';
  import RssButton from '$lib/components/RssButton.svelte';
  import * as m from '$lib/paraglide/messages';
  import { page } from '$app/state';
  import { goto, beforeNavigate } from '$app/navigation';
  import { fetchDatasets } from '$lib/services/datasets';
  import type { SelectedFacetValue } from '$lib/services/facets';
  import { decodeDiscreteParam, decodeRangeParam } from '$lib/url';
  import { localizeHref } from '$lib/utils/i18n';

  // Derive searchRequest from URL, which is the single source of truth.
  let searchRequest: SearchRequest = $derived({
    query: page.url.searchParams.get('search') || undefined,
    publisher: decodeDiscreteParam('publishers'),
    keyword: decodeDiscreteParam('keywords'),
    format: decodeDiscreteParam('format'),
    class: decodeDiscreteParam('class'),
    terminologySource: decodeDiscreteParam('terminologySource'),
    size: decodeRangeParam('size'),
    status: decodeDiscreteParam('status'),
  });

  // Check cache synchronously to initialize state without flash
  function getInitialStateFromCache(): {
    searchResults: SearchResults | undefined;
    accumulatedDatasets: DatasetCardType[];
    currentOffset: number;
    hasMore: boolean;
    shouldFetch: boolean;
    scrollY: number;
  } {
    const currentSearchKey = getSearchKey({
      query: page.url.searchParams.get('search') || undefined,
      publisher: decodeDiscreteParam('publishers'),
      keyword: decodeDiscreteParam('keywords'),
      format: decodeDiscreteParam('format'),
      class: decodeDiscreteParam('class'),
      terminologySource: decodeDiscreteParam('terminologySource'),
      size: decodeRangeParam('size'),
      status: decodeDiscreteParam('status'),
    });

    if (searchCache && searchCache.searchKey === currentSearchKey) {
      const cache = searchCache;
      searchCache = null; // Clear cache after use
      return {
        searchResults: {
          datasets: cache.datasets.slice(0, 24),
          total: cache.total,
          facets: cache.facets,
          time: cache.time,
        },
        accumulatedDatasets: cache.datasets,
        currentOffset: cache.offset,
        hasMore: cache.offset < cache.total,
        shouldFetch: false,
        scrollY: cache.scrollY,
      };
    }

    return {
      searchResults: undefined,
      accumulatedDatasets: [],
      currentOffset: 0,
      hasMore: true,
      shouldFetch: true,
      scrollY: 0,
    };
  }

  // Initialize state synchronously from cache (if available)
  const initialState = getInitialStateFromCache();
  let searchResults: SearchResults | undefined = $state(
    initialState.searchResults,
  );
  let isLoading = $state(initialState.shouldFetch);

  // Writable derived - reads from URL, can be written to for local updates
  let localQuery = $derived(searchRequest.query);

  let selectedValues: {
    publisher: SelectedFacetValue[];
    keyword: SelectedFacetValue[];
    format: SelectedFacetValue[];
    class: SelectedFacetValue[];
    terminologySource: SelectedFacetValue[];
    size: { min?: number; max?: number };
  } = $derived({
    publisher: searchRequest.publisher.map((value) => {
      const facet = searchResults?.facets.publisher.find(
        (publisher) => publisher.value === value,
      );
      return {
        value,
        label: facet?.label || { '': value },
      };
    }),
    keyword: searchRequest.keyword.map((value) => {
      const facet = searchResults?.facets.keyword.find(
        (keyword) => keyword.value === value,
      );
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
    class: searchRequest.class.map((value) => {
      const facet = searchResults?.facets.class.find(
        (cls) => cls.value === value,
      );
      return {
        value,
        label: facet?.label || { '': value },
      };
    }),
    terminologySource: searchRequest.terminologySource.map((value) => {
      const facet = searchResults?.facets.terminologySource.find(
        (terminologySource) => terminologySource.value === value,
      );
      return {
        value,
        label: facet?.label || { '': value },
      };
    }),
    size: {
      min: searchRequest.size.min,
      max: searchRequest.size.max,
    },
  });

  let debounceTimer: ReturnType<typeof setTimeout>;
  let inputElement = $state<HTMLInputElement>();
  let facetsLoaded = $state(false);

  // Mobile filters drawer state
  let mobileFiltersOpen = $state(false);

  function toggleMobileFilters() {
    mobileFiltersOpen = !mobileFiltersOpen;
  }

  // Close mobile filters on Escape key
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && mobileFiltersOpen) {
      mobileFiltersOpen = false;
    }
  }

  // Body scroll lock when mobile filters are open
  $effect(() => {
    if (mobileFiltersOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    // Cleanup
    return () => {
      document.body.style.overflow = '';
    };
  });

  // Infinite scroll state - initialized from cache if available
  let accumulatedDatasets = $state<DatasetCardType[]>(
    initialState.accumulatedDatasets,
  );
  let currentOffset = $state(initialState.currentOffset);
  let isLoadingMore = $state(false);
  let hasMore = $state(initialState.hasMore);
  let sentinelElement = $state<HTMLDivElement>();
  let observer: IntersectionObserver;

  // Restore scroll position if we initialized from cache
  if (!initialState.shouldFetch && initialState.scrollY > 0) {
    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      window.scrollTo(0, initialState.scrollY);
    });
  }

  const ITEMS_PER_PAGE = 24;

  // Save state to module-level cache before navigating away
  beforeNavigate(() => {
    if (accumulatedDatasets.length > 0 && searchResults) {
      searchCache = {
        datasets: accumulatedDatasets,
        offset: currentOffset,
        scrollY: window.scrollY,
        total: searchResults.total,
        facets: searchResults.facets,
        searchKey: getSearchKey(searchRequest),
        time: searchResults.time,
      };
    }
  });

  // Single function to update URL - called from all user interactions
  function updateURL(
    previous: SearchRequest,
    newValue: Partial<SearchRequest>,
  ) {
    const url = new URL(window.location.href);
    const params = { ...previous, ...newValue };

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

    if (params.keyword && params.keyword.length > 0) {
      url.searchParams.set('keywords', params.keyword.join(','));
    } else {
      url.searchParams.delete('keywords');
    }

    if (params.format && params.format.length > 0) {
      url.searchParams.set('format', params.format.join(','));
    } else {
      url.searchParams.delete('format');
    }

    if (params.class && params.class.length > 0) {
      url.searchParams.set('class', params.class.join(','));
    } else {
      url.searchParams.delete('class');
    }

    if (params.terminologySource && params.terminologySource.length > 0) {
      url.searchParams.set(
        'terminologySource',
        params.terminologySource.join(','),
      );
    } else {
      url.searchParams.delete('terminologySource');
    }

    if (params.status && params.status.length > 0) {
      url.searchParams.set('status', params.status.join(','));
    } else {
      url.searchParams.delete('status');
    }

    if (params.size?.min !== undefined || params.size?.max !== undefined) {
      url.searchParams.set(
        'size',
        `${params.size?.min ?? ''}-${params.size?.max ?? ''}`,
      );
    } else {
      url.searchParams.delete('size');
    }

    // Only navigate if URL actually changed
    if (url.href === window.location.href) {
      return;
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
      updateURL(searchRequest, { query });
    }, 600);
  });

  // Track whether initial data was loaded from cache (to skip first fetch)
  let initializedFromCache = !initialState.shouldFetch;

  // Watch searchRequest (derived from URL) and fetch data
  $effect(() => {
    const request = searchRequest;

    // Skip the initial fetch if we already have data from cache
    if (initializedFromCache) {
      initializedFromCache = false;
      return;
    }

    // Set loading state
    isLoading = true;

    fetchDatasets(request, ITEMS_PER_PAGE, 0).then((results) => {
      searchResults = results;
      accumulatedDatasets = [...results.datasets];
      currentOffset = results.datasets.length;
      hasMore = currentOffset < results.total;
      isLoading = false;

      if (!facetsLoaded) {
        facetsLoaded = true;
      }
    });
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

  // Focus search input on initial page load only (not on back navigation)
  $effect(() => {
    if (inputElement && !initializedFromCache) {
      // Use preventScroll to avoid Safari scrolling to the input
      inputElement.focus({ preventScroll: true });
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

  // SEO: canonical and hreflang URLs
  const canonicalUrl = $derived(
    `${page.url.origin}${localizeHref('/datasets', { locale: 'nl' })}${page.url.search}`,
  );
  const enUrl = $derived(
    `${page.url.origin}${localizeHref('/datasets', { locale: 'en' })}${page.url.search}`,
  );
</script>

<svelte:window onkeydown={handleKeydown} />

<svelte:head>
  <title>Datasets | Netwerk Digitaal Erfgoed</title>
  <meta content={m.header_tagline()} name="description" />
  <link rel="canonical" href={canonicalUrl} />
  <link rel="alternate" hreflang="nl" href={canonicalUrl} />
  <link rel="alternate" hreflang="en" href={enUrl} />
  <link rel="alternate" hreflang="x-default" href={canonicalUrl} />
  <link
    rel="alternate"
    type="application/rss+xml"
    title={m.rss_feed_title()}
    href={`/datasets/rss${page.url.search}`}
  />
</svelte:head>

<div class="max-w-7xl mx-auto px-4 lg:px-8 py-8 font-sans">
  <h1 class="sr-only">{m.header_title()}</h1>
  <input
    bind:this={inputElement}
    bind:value={localQuery}
    class="w-full px-6 py-4 text-lg border-2 border-gray-300 dark:border-gray-600 rounded-lg mb-8 transition-colors focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 placeholder:text-gray-400 dark:placeholder:text-gray-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
    placeholder={m.search_placeholder()}
    type="search"
  />

  {#if searchResults}
    <ActiveFilters
      {selectedValues}
      onRemove={(type, value) => {
        if (type === 'publisher') {
          const newPublishers = searchRequest.publisher.filter(
            (p) => p !== value,
          );
          updateURL(searchRequest, { publisher: newPublishers });
        } else if (type === 'keyword') {
          const newKeywords = searchRequest.keyword.filter((k) => k !== value);
          updateURL(searchRequest, { keyword: newKeywords });
        } else if (type === 'format') {
          const newFormats = searchRequest.format.filter((f) => f !== value);
          updateURL(searchRequest, { format: newFormats });
        } else if (type === 'class') {
          const newClasses = searchRequest.class.filter((c) => c !== value);
          updateURL(searchRequest, { class: newClasses });
        } else if (type === 'terminologySource') {
          const newSources = searchRequest.terminologySource.filter(
            (s) => s !== value,
          );
          updateURL(searchRequest, { terminologySource: newSources });
        } else if (type === 'size') {
          updateURL(searchRequest, {
            size: { min: undefined, max: undefined },
          });
        }
      }}
    />
  {/if}

  <div class="flex gap-4 lg:gap-8">
    <!-- Sidebar with facets -->
    <aside class="hidden lg:block w-64 flex-shrink-0">
      <FacetsPanel
        facets={searchResults?.facets}
        selectedValues={{
          publisher: searchRequest.publisher,
          keyword: searchRequest.keyword,
          format: searchRequest.format,
          class: searchRequest.class,
          terminologySource: searchRequest.terminologySource,
          size: searchRequest.size,
          status: searchRequest.status,
        }}
        loading={!searchResults?.facets}
        onChange={(facetKey, value) => {
          updateURL(searchRequest, { [facetKey]: value });
        }}
      />
    </aside>

    <!-- Main content area -->
    <div class="flex-1 min-w-0">
      {#if isLoading}
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
      {:else if searchResults}
        <div class="mb-6 flex items-center justify-between">
          <p
            class="text-gray-600 dark:text-gray-400 text-sm font-medium"
            class:invisible={searchResults.total === 0}
          >
            {m.search_datasets_found({ count: searchResults.total })} (in {Math.round(
              searchResults.time,
            )} ms)
          </p>
          <div class="flex items-center gap-2">
            <RssButton />
            <RunSparqlButton {searchRequest} />
          </div>
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

  <!-- Mobile Filters Button (Fixed, bottom-right) -->
  <button
    class="lg:hidden fixed bottom-6 right-6 z-50 flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg cursor-pointer transition-colors"
    onclick={toggleMobileFilters}
    aria-label="Open filters"
  >
    <!-- Filter Icon (Funnel) -->
    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
      />
    </svg>
    <span class="font-semibold">
      Filters
      {#if Object.values(selectedValues).filter( (v) => (Array.isArray(v) ? v.length > 0 : v.min !== undefined || v.max !== undefined), ).length > 0}
        <span class="ml-1"
          >({Object.values(selectedValues).filter((v) =>
            Array.isArray(v)
              ? v.length > 0
              : v.min !== undefined || v.max !== undefined,
          ).length})</span
        >
      {/if}
    </span>
  </button>
</div>

<!-- Mobile Filters Drawer -->
<!-- Backdrop -->
<div
  class="lg:hidden fixed inset-0 bg-black z-40 transition-opacity duration-300 {mobileFiltersOpen
    ? 'opacity-50'
    : 'opacity-0 pointer-events-none'}"
  onclick={toggleMobileFilters}
  onkeydown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleMobileFilters();
    }
  }}
  role="button"
  tabindex="-1"
  aria-label="Close filters"
></div>

<!-- Drawer -->
<aside
  class="lg:hidden fixed top-0 left-0 bottom-0 z-50 w-[85%] max-w-sm bg-white dark:bg-gray-900 shadow-2xl overflow-y-auto transition-transform duration-300 {mobileFiltersOpen
    ? 'translate-x-0'
    : '-translate-x-full'}"
>
  <!-- Drawer Header -->
  <div
    class="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between"
  >
    <div>
      <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
        Filters
      </h2>
      {#if Object.values(selectedValues).filter( (v) => (Array.isArray(v) ? v.length > 0 : v.min !== undefined || v.max !== undefined), ).length > 0}
        <p class="text-sm text-gray-600 dark:text-gray-400">
          {Object.values(selectedValues).filter((v) =>
            Array.isArray(v)
              ? v.length > 0
              : v.min !== undefined || v.max !== undefined,
          ).length} active
        </p>
      {/if}
    </div>
    <button
      onclick={toggleMobileFilters}
      class="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors cursor-pointer"
      aria-label="Close filters"
    >
      <svg
        class="w-6 h-6 text-gray-600 dark:text-gray-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
    </button>
  </div>

  <!-- Drawer Content (Facets) -->
  <div class="px-6 py-4">
    <FacetsPanel
      facets={searchResults?.facets}
      selectedValues={{
        publisher: searchRequest.publisher,
        keyword: searchRequest.keyword,
        format: searchRequest.format,
        class: searchRequest.class,
        terminologySource: searchRequest.terminologySource,
        size: searchRequest.size,
        status: searchRequest.status,
      }}
      loading={!searchResults?.facets}
      onChange={(facetKey, value) => {
        updateURL(searchRequest, { [facetKey]: value });
      }}
    />
  </div>

  <!-- Drawer Footer -->
  <div
    class="sticky bottom-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 px-6 py-4 space-y-3"
  >
    <button
      onclick={toggleMobileFilters}
      class="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors cursor-pointer"
    >
      {m.facets_apply_filters()}
    </button>
    <button
      onclick={() => {
        updateURL(searchRequest, {
          publisher: [],
          keyword: [],
          format: [],
          class: [],
          terminologySource: [],
          size: { min: undefined, max: undefined },
          status: [],
        });
      }}
      class="w-full px-6 py-3 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 font-semibold rounded-lg transition-colors cursor-pointer"
    >
      {m.facets_clear_all()}
    </button>
  </div>
</aside>

<style>
  /* Make the clear button (X) in search input show pointer cursor */
  :global(input[type='search']::-webkit-search-cancel-button) {
    cursor: pointer;
  }
</style>
