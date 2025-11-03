<script lang="ts">
  import type { CountedFacetValue } from '$lib/services/facets';
  import FacetItem from './FacetItem.svelte';
  import FacetHelper from './FacetHelper.svelte';
  import * as m from '$lib/paraglide/messages';
  import { facetDisplayValue } from '$lib/services/facets';

  let {
    title,
    values,
    selectedValues,
    onChange,
    explanation,
  }: {
    title: string;
    values: CountedFacetValue[];
    selectedValues: string[];
    onChange: (newValues: string[]) => void;
    explanation?: string;
  } = $props();

  const FOLD_LIMIT = 6;
  let isExpanded = $state(false);
  let searchQuery = $state('');
  let scrollContainer: HTMLDivElement;
  let showGradient = $state(false);

  // Filter values based on search query
  const filterBySearch = (facetValues: CountedFacetValue[]) => {
    if (!searchQuery.trim()) return facetValues;

    const query = searchQuery.toLowerCase();
    return facetValues.filter((v) => {
      const displayValue = facetDisplayValue(v).toLowerCase();
      return (
        displayValue.includes(query) || v.value.toLowerCase().includes(query)
      );
    });
  };

  // Separate group values from individual values, then filter by search
  const groupValues = $derived(() =>
    filterBySearch(values.filter((v) => v.value.startsWith('group:'))),
  );
  const individualValues = $derived(() =>
    filterBySearch(values.filter((v) => !v.value.startsWith('group:'))),
  );

  // Sort individual values: checked items first, then by count
  const sortedIndividualValues = $derived(() => {
    const checked = individualValues().filter((v) =>
      selectedValues.includes(v.value),
    );
    const unchecked = individualValues().filter(
      (v) => !selectedValues.includes(v.value),
    );
    return [...checked, ...unchecked];
  });

  const hasGroups = $derived(groupValues().length > 0);

  // Groups are always shown
  // Individual values: show first FOLD_LIMIT when collapsed, all when expanded
  const displayedIndividualValues = $derived(() => {
    const sorted = sortedIndividualValues();

    if (hasGroups) {
      // With groups: show selected individuals when collapsed, all when expanded
      const checkedIndividuals = sorted.filter((v) =>
        selectedValues.includes(v.value),
      );
      return isExpanded ? sorted : checkedIndividuals;
    } else {
      // Without groups: show first FOLD_LIMIT when collapsed, all when expanded
      return isExpanded ? sorted : sorted.slice(0, FOLD_LIMIT);
    }
  });

  const hasMore = $derived(() => {
    if (hasGroups) {
      // With groups: show "more" if there are unselected individual values
      const selectedCount = individualValues().filter((v) =>
        selectedValues.includes(v.value),
      ).length;
      return individualValues().length > selectedCount;
    } else {
      // Without groups: show "more" if more than FOLD_LIMIT
      return individualValues().length > FOLD_LIMIT;
    }
  });

  const displayedValues = $derived(() => [
    ...groupValues(),
    ...displayedIndividualValues(),
  ]);

  function isChecked(value: string): boolean {
    return selectedValues.includes(value);
  }

  function toggleExpanded() {
    isExpanded = !isExpanded;
  }

  function toggleValue(value: string, checked: boolean) {
    const newValues = checked
      ? [...selectedValues, value]
      : selectedValues.filter((v) => v !== value);
    onChange(newValues);
  }

  function checkScrollGradient() {
    if (!scrollContainer || !isExpanded) {
      showGradient = false;
      return;
    }

    const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
    const isScrollable = scrollHeight > clientHeight;
    const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1; // -1 for rounding

    showGradient = isScrollable && !isAtBottom;
  }

  // Check gradient whenever expansion state changes or values change
  $effect(() => {
    // Watch these reactive values
    void isExpanded;
    void displayedValues();

    // Use setTimeout to ensure DOM has updated
    setTimeout(() => checkScrollGradient(), 0);
  });
</script>

<div class="mb-6">
  <h3
    class="relative text-base font-semibold text-gray-900 dark:text-gray-100 mb-3 tracking-tight flex items-center"
  >
    {title}
    {#if explanation}
      <FacetHelper {explanation} />
    {/if}
  </h3>

  <!-- Search/Filter Input -->
  {#if values.length > FOLD_LIMIT}
    <input
      type="search"
      bind:value={searchQuery}
      placeholder={m.facets_search()}
      class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded mb-3 transition-colors focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 placeholder:text-gray-400 dark:placeholder:text-gray-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
    />
  {/if}

  <!-- Scrollable facet list with max height and text fade -->
  <div
    bind:this={scrollContainer}
    class="space-y-1 overflow-y-auto pr-2"
    onscroll={checkScrollGradient}
    style="max-height: {isExpanded ? '400px' : 'none'}; {showGradient
      ? 'mask-image: linear-gradient(to bottom, black calc(100% - 4rem), transparent 100%); -webkit-mask-image: linear-gradient(to bottom, black calc(100% - 4rem), transparent 100%);'
      : ''}"
  >
    {#each displayedValues() as value (value.value)}
      <FacetItem
        {value}
        isChecked={isChecked(value.value)}
        onChange={(checked) => toggleValue(value.value, checked)}
      />
    {/each}
  </div>

  {#if hasMore()}
    <button
      class="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium transition-colors cursor-pointer"
      onclick={toggleExpanded}
      type="button"
    >
      {isExpanded ? m.facets_show_less() : m.facets_show_more()}
    </button>
  {/if}
</div>
