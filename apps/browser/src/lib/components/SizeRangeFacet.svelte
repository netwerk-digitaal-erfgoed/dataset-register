<script lang="ts">
  import { formatNumber, type Histogram } from '$lib/services/facets';
  import * as m from '$lib/paraglide/messages';
  import { getLocale } from '$lib/paraglide/runtime';
  import { onMount } from 'svelte';
  import FacetHelper from './FacetHelper.svelte';

  // Dynamically import to avoid SSR issues
  type RangeSliderComponent = typeof import('svelte-range-slider-pips').default;
  let RangeSlider = $state<RangeSliderComponent | null>(null);
  let mounted = $state(false);

  onMount(async () => {
    const module = await import('svelte-range-slider-pips');
    RangeSlider = module.default;
    mounted = true;
  });

  let {
    histogram,
    selectedValues,
    onChange,
    explanation,
  }: {
    selectedValues: { min?: number; max?: number };
    histogram: Histogram;
    onChange: (min?: number, max?: number) => void;
    explanation?: string;
  } = $props();

  const locale = $derived(getLocale());

  // Convert between actual values and logarithmic scale
  function toLogScale(value: number): number {
    return Math.log10(Math.max(1, value));
  }

  function fromLogScale(logValue: number): number {
    return Math.round(Math.pow(10, logValue));
  }

  // Calculate logarithmic range bounds based on bin numbers
  // Bins represent fixed logarithmic ranges (0-1, 1-2, etc.)
  const logMin = $derived(
    histogram.bins.length > 0
      ? Math.min(...histogram.bins.map((b) => b.bin))
      : 0,
  );
  const logMax = $derived(
    histogram.bins.length > 0
      ? Math.max(...histogram.bins.map((b) => b.bin)) + 1 // +1 to include end of last bin
      : 10,
  );

  // Derive slider values from selectedValues (one-way data flow)
  const sliderValues = $derived<[number, number]>([
    selectedValues.min !== undefined ? toLogScale(selectedValues.min) : logMin,
    selectedValues.max !== undefined ? toLogScale(selectedValues.max) : logMax,
  ]);

  // Derive actual values from slider
  const localMin = $derived(fromLogScale(sliderValues[0]));
  const localMax = $derived(fromLogScale(sliderValues[1]));

  function handleSliderStop(event: CustomEvent) {
    const [minLog, maxLog] = event.detail.values;
    // If slider is at the full range, don't filter (return undefined)
    const min = minLog === logMin ? undefined : fromLogScale(minLog);
    const max = maxLog === logMax ? undefined : fromLogScale(maxLog);
    onChange(min, max);
  }

  // Custom formatter for pips
  function pipFormatter(value: number): string {
    return formatNumber(fromLogScale(value), locale);
  }

  // Get bin label for histogram tooltips
  function getBinLabel(bin: number): string {
    const ranges = [
      '1-10',
      '10-100',
      '100-1K',
      '1K-10K',
      '10K-100K',
      '100K-1M',
      '1M-10M',
      '10M-100M',
      '100M-1B',
      '1B+',
    ];
    return ranges[bin] || '';
  }

  // Calculate max count for normalization
  const maxCount = $derived(
    histogram.bins.length > 0
      ? Math.max(...histogram.bins.map((b) => b.count))
      : 1,
  );

  // Normalize bar heights (percentage of max)
  function getBarHeight(count: number): number {
    return (count / maxCount) * 100;
  }

  // Calculate bin position and width based on logarithmic scale
  // Account for RangeSlider's 16px margins on each side
  function getBinPosition(binNumber: number): {
    left: string;
    width: string;
  } {
    // Bin boundaries in log10 scale
    const binStart = binNumber;
    const binEnd = binNumber + 1;

    // Calculate position relative to slider's range
    const totalRange = logMax - logMin;
    const leftPct = ((binStart - logMin) / totalRange) * 100;
    const widthPct = ((binEnd - binStart) / totalRange) * 100;

    // RangeSlider has 16px margin on each side (32px total)
    // Bars should span the same width as the slider track
    const SLIDER_MARGIN = 16;

    return {
      left: `calc(${SLIDER_MARGIN}px + (100% - ${SLIDER_MARGIN * 2}px) * ${leftPct / 100})`,
      width: `calc((100% - ${SLIDER_MARGIN * 2}px) * ${widthPct / 100} - 2px)`,
    };
  }
</script>

<div class="mb-6">
  <h3
    class="relative text-base font-semibold text-gray-900 dark:text-gray-100 mb-3 tracking-tight flex items-center"
  >
    {m.facets_size()}
    {#if explanation}
      <FacetHelper {explanation} />
    {/if}
  </h3>

  <div class="space-y-4">
    <!-- Histogram -->
    {#if histogram.bins.length > 0}
      <div class="relative h-24 histogram-container">
        {#each histogram.bins as bin (bin.bin)}
          {@const position = getBinPosition(bin.bin)}
          <div
            class="absolute bottom-0 bg-blue-500 dark:bg-blue-400 rounded-t hover:bg-blue-600 dark:hover:bg-blue-500 transition-colors cursor-help group"
            style="left: {position.left}; width: {position.width}; height: {getBarHeight(
              bin.count,
            )}%"
            title="{getBinLabel(bin.bin)} triples: {bin.count} datasets"
          >
            <!-- Tooltip on hover -->
            <div
              class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10"
            >
              <div class="font-semibold">{getBinLabel(bin.bin)}</div>
              <div>{bin.count} datasets</div>
            </div>
          </div>
        {/each}
      </div>
    {/if}

    <div>
      {#if mounted && RangeSlider}
        <RangeSlider
          values={sliderValues}
          min={logMin}
          max={logMax}
          range
          pushy
          float
          formatter={pipFormatter}
          on:stop={handleSliderStop}
        />
      {:else}
        <div
          class="h-12 flex items-center justify-center text-gray-500 text-sm"
        >
          Loading slider...
        </div>
      {/if}
    </div>

    <div class="text-sm text-gray-700 dark:text-gray-300 flex justify-between">
      <span
        >{m.facets_size_min()}
        {formatNumber(localMin, locale)}
        {m.dataset_triples({ count: localMin })}</span
      >
      <span
        >{m.facets_size_max()}
        {formatNumber(localMax, locale)}
        {m.dataset_triples({ count: localMax })}</span
      >
    </div>
  </div>
</div>

<style>
  :global(.rangeSlider) {
    --range-slider: #2563eb;
    --range-handle-inactive: #3b82f6;
    --range-handle: #2563eb;
    --range-handle-focus: #1d4ed8;
    --range-float: #2563eb;
  }

  :global(.dark .rangeSlider) {
    --range-slider: #3b82f6;
    --range-handle-inactive: #60a5fa;
    --range-handle: #3b82f6;
    --range-handle-focus: #2563eb;
    --range-float: #3b82f6;
  }
</style>
