<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { getLocale } from '$lib/paraglide/runtime';
  import {
    facetDisplayValue,
    type FacetKey,
    type FacetValue,
    formatNumber,
  } from '$lib/services/facets';

  let {
    selectedValues,
    onRemove,
  }: {
    selectedValues: {
      publisher: FacetValue[];
      keyword: FacetValue[];
      format: FacetValue[];
      class: FacetValue[];
      size: {
        min?: number;
        max?: number;
      };
    };
    onRemove: (type: FacetKey | 'size', value?: string) => void;
  } = $props();

  const locale = $derived(getLocale());

  function getSizeDisplay(): string | null {
    const min = selectedValues.size.min;
    const max = selectedValues.size.max;
    const hasMin = min !== undefined;
    const hasMax = max !== undefined;

    if (hasMin && hasMax) {
      return `${m.facets_size()}: ${formatNumber(min, locale)} – ${formatNumber(max, locale)} ${m.dataset_triples({ count: max })}`;
    } else if (hasMin) {
      return `${m.facets_size()}: ≥ ${formatNumber(min, locale)} ${m.dataset_triples({ count: min })}`;
    } else if (hasMax) {
      return `${m.facets_size()}: ≤ ${formatNumber(max, locale)} ${m.dataset_triples({ count: max })}`;
    }

    return null;
  }

  let allSelectedValues = $derived([
    ...selectedValues.publisher.map((facet: FacetValue) => ({
      type: 'publisher' as FacetKey,
      facet,
    })),
    ...selectedValues.keyword.map((facet: FacetValue) => ({
      type: 'keyword' as FacetKey,
      facet,
    })),
    ...selectedValues.format.map((facet: FacetValue) => ({
      type: 'format' as FacetKey,
      facet,
    })),
    ...selectedValues.class.map((facet: FacetValue) => ({
      type: 'class' as FacetKey,
      facet,
    })),
    ...(getSizeDisplay()
      ? [
          {
            type: 'size' as const,
            facet: {
              value: 'size',
              label: { '': getSizeDisplay() as string },
            },
          },
        ]
      : []),
  ]);
</script>

{#if allSelectedValues.length > 0}
  <div class="mb-6 flex flex-wrap gap-2 items-center">
    {#each allSelectedValues as selectedValue (selectedValue.type + ':' + selectedValue.facet.value)}
      {@const displayValue = facetDisplayValue(selectedValue.facet)}
      {@const breakClass = displayValue.includes(' ')
        ? 'break-words'
        : 'break-all'}
      <button
        class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full text-sm font-medium hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors cursor-pointer"
        onclick={() => onRemove(selectedValue.type, selectedValue.facet.value)}
        type="button"
      >
        <span class={breakClass} title={displayValue}>{displayValue}</span>
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
