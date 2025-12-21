<script lang="ts">
  import {
    type CountedFacetValue,
    facetDisplayValue,
    facetValueTooltip,
  } from '$lib/services/facets';
  import { getLocale } from '$lib/paraglide/runtime';
  import { Tooltip } from 'flowbite-svelte';
  import InfoCircleOutline from 'flowbite-svelte-icons/InfoCircleOutline.svelte';

  let {
    value,
    isChecked,
    onChange,
  }: {
    value: CountedFacetValue;
    isChecked: boolean;
    onChange: (checked: boolean) => void;
  } = $props();

  const locale = $derived(getLocale());
  const displayValue = $derived(facetDisplayValue(value));
  const tooltip = $derived(facetValueTooltip(value));
  const breakClass = $derived(
    displayValue.includes(' ') ? 'break-words' : 'break-all',
  );
  const tooltipId = $derived(`tooltip-${value.value}`);

  function formatCount(count: number): string {
    return count.toLocaleString(locale);
  }

  function handleChange() {
    onChange(!isChecked);
  }
</script>

<label
  class="flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 p-1 rounded transition-colors"
>
  <input
    checked={isChecked}
    class="w-4 h-4 text-blue-600 border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600 cursor-pointer"
    onchange={handleChange}
    type="checkbox"
    value={value.value}
  />
  <span
    class="flex-1 text-sm text-gray-700 dark:text-gray-300 leading-tight {breakClass} inline-flex items-center gap-1"
    title={displayValue}
  >
    {displayValue}
    {#if tooltip}
      <button
        type="button"
        id={tooltipId}
        class="inline-flex items-center"
        onclick={(e) => e.stopPropagation()}
      >
        <InfoCircleOutline
          class="h-4 w-4 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
        />
      </button>
      <Tooltip triggeredBy="#{tooltipId}">{tooltip}</Tooltip>
    {/if}
  </span>
  <span
    class="inline-flex items-center justify-center px-2 py-0.5 text-xs font-medium tabular-nums rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
  >
    {formatCount(value.count)}
  </span>
</label>
