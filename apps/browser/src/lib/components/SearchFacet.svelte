<script lang="ts">
  import type { FacetValue } from '$lib/services/facets';
  import { getLocalizedValue } from '$lib/utils/i18n';
  import { getLocale } from '$lib/paraglide/runtime';
  import * as m from '$lib/paraglide/messages';

  let {
    title,
    values,
    selectedValues,
    onChange,
  }: {
    title: string;
    values: FacetValue[];
    selectedValues: string[];
    onChange: (newValues: string[]) => void;
  } = $props();

  const FOLD_LIMIT = 10;
  let isExpanded = $state(false);
  const locale = $derived(getLocale());

  // Sort values: checked items first, then by count
  const sortedValues = $derived(() => {
    const checked = values.filter((v) => selectedValues.includes(v.value));
    const unchecked = values.filter((v) => !selectedValues.includes(v.value));
    return [...checked, ...unchecked];
  });

  // Display only top FOLD_LIMIT items when folded
  const displayedValues = $derived(() => {
    const sorted = sortedValues();
    return isExpanded ? sorted : sorted.slice(0, FOLD_LIMIT);
  });

  const hasMore = $derived(values.length > FOLD_LIMIT);

  function isChecked(value: string): boolean {
    return selectedValues.includes(value);
  }

  function toggleExpanded() {
    isExpanded = !isExpanded;
  }

  function formatCount(count: number): string {
    return count.toLocaleString(locale);
  }
</script>

<div class="mb-6">
  <h3
    class="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3 tracking-tight"
  >
    {title}
  </h3>
  <div class="space-y-1">
    {#each displayedValues() as value (value.value)}
      <label
        class="flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 p-1 rounded transition-colors"
      >
        <input
          checked={isChecked(value.value)}
          class="w-4 h-4 accent-blue-600 border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600 cursor-pointer"
          type="checkbox"
          onchange={() => {
            const newValues = isChecked(value.value)
              ? selectedValues.filter((v) => v !== value.value)
              : [...selectedValues, value.value];
            onChange(newValues);
          }}
          value={value.value}
        />
        <span
          class="flex-1 text-sm text-gray-700 dark:text-gray-300 leading-tight"
        >
          {getLocalizedValue(value.label)}
        </span>
        <span
          class="inline-flex items-center justify-center px-2 py-0.5 text-xs font-medium tabular-nums rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
        >
          {formatCount(value.count)}
        </span>
      </label>
    {/each}
  </div>

  {#if hasMore}
    <button
      class="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium transition-colors cursor-pointer"
      onclick={toggleExpanded}
      type="button"
    >
      {isExpanded ? m['facets.show_less']() : m['facets.show_more']()}
    </button>
  {/if}
</div>
