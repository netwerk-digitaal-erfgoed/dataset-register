<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import {
    facetDisplayValue,
    type FacetKey,
    type FacetValue,
  } from '$lib/services/facets';

  let {
    selectedValues,
    onRemove,
  }: {
    selectedValues: {
      publisher: FacetValue[];
      format: FacetValue[];
    };
    onRemove: (type: FacetKey, value: string) => void;
  } = $props();

  let allSelectedValues = $derived([
    ...selectedValues.publisher.map((facet: FacetValue) => ({
      type: 'publisher' as FacetKey,
      facet,
    })),
    ...selectedValues.format.map((facet: FacetValue) => ({
      type: 'format' as FacetKey,
      facet,
    })),
  ]);
</script>

{#if allSelectedValues.length > 0}
  <div class="mb-6 flex flex-wrap gap-2 items-center">
    {#each allSelectedValues as selectedValue (selectedValue.type + ':' + selectedValue.facet.value)}
      <button
        class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full text-sm font-medium hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors cursor-pointer"
        onclick={() => onRemove(selectedValue.type, selectedValue.facet.value)}
        type="button"
      >
        <span>{facetDisplayValue(selectedValue.facet)}</span>
        <svg
          class="w-3.5 h-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-label={m.facets_remove_filter()}
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    {/each}
  </div>
{/if}
