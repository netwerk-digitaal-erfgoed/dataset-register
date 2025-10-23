<script lang="ts">
  import type { CountedFacetValue } from '$lib/services/facets';
  import FacetItem from './FacetItem.svelte';
  import * as m from '$lib/paraglide/messages';

  let {
    title,
    values,
    selectedValues,
    onChange,
  }: {
    title: string;
    values: CountedFacetValue[];
    selectedValues: string[];
    onChange: (newValues: string[]) => void;
  } = $props();

  const FOLD_LIMIT = 10;
  let isExpanded = $state(false);

  // Separate group values from individual values
  const groupValues = $derived(() =>
    values.filter((v) => v.value.startsWith('group:')),
  );
  const individualValues = $derived(() =>
    values.filter((v) => !v.value.startsWith('group:')),
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

  // Groups are always shown above the fold
  // If groups exist, selected individual values stay above fold
  // If no groups, show first FOLD_LIMIT individual values above fold
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
</script>

<div class="mb-6">
  <h3
    class="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3 tracking-tight"
  >
    {title}
  </h3>
  <div class="space-y-1">
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
      {isExpanded ? m['facets.show_less']() : m['facets.show_more']()}
    </button>
  {/if}
</div>
