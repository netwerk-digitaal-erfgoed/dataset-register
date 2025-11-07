<script lang="ts">
  import SearchFacet from './SearchFacet.svelte';
  import SizeRangeFacet from './SizeRangeFacet.svelte';
  import * as m from '$lib/paraglide/messages';
  import type { Facets, FacetKey } from '$lib/services/facets';

  let {
    facets,
    selectedValues,
    loading = false,
    onChange,
  }: {
    facets: Facets | undefined;
    selectedValues: {
      publisher: string[];
      keyword: string[];
      format: string[];
      class: string[];
      terminologySource: string[];
      size: { min?: number; max?: number };
    };
    loading?: boolean;
    onChange: (
      facetKey: FacetKey,
      value: string[] | { min?: number; max?: number },
    ) => void;
  } = $props();
</script>

{#if loading}
  <div
    class="h-6 bg-gradient-to-r from-gray-300 to-gray-200 dark:from-gray-700 dark:to-gray-600 rounded mb-3 w-3/4 animate-shimmer"
  ></div>
{:else}
  {#if (facets?.publisher ?? []).length > 0 || selectedValues.publisher.length > 0}
    <SearchFacet
      selectedValues={selectedValues.publisher}
      values={facets?.publisher ?? []}
      title={m.facets_publisher()}
      explanation={m.publisher_explanation()}
      onChange={(values) => onChange('publisher', values)}
    />
  {/if}
  {#if (facets?.keyword ?? []).length > 0 || selectedValues.keyword.length > 0}
    <SearchFacet
      selectedValues={selectedValues.keyword}
      values={facets?.keyword ?? []}
      title={m.facets_keyword()}
      explanation={m.keyword_explanation()}
      onChange={(values) => onChange('keyword', values)}
    />
  {/if}
  {#if (facets?.format ?? []).length > 0 || selectedValues.format.length > 0}
    <SearchFacet
      selectedValues={selectedValues.format}
      values={facets?.format ?? []}
      title={m.facets_format()}
      explanation={m.format_explanation()}
      onChange={(values) => onChange('format', values)}
    />
  {/if}
  {#if (facets?.class ?? []).length > 0 || selectedValues.class.length > 0}
    <SearchFacet
      selectedValues={selectedValues.class}
      values={facets?.class ?? []}
      title={m.facets_class()}
      explanation={m.class_explanation()}
      onChange={(values) => onChange('class', values)}
    />
  {/if}
  {#if (facets?.terminologySource ?? []).length > 0 || selectedValues.terminologySource.length > 0}
    <SearchFacet
      selectedValues={selectedValues.terminologySource}
      values={facets?.terminologySource ?? []}
      title={m.facets_terminology_source()}
      explanation={m.terminology_source_explanation()}
      onChange={(values) => onChange('terminologySource', values)}
    />
  {/if}
  {#if facets?.size && (facets.size.bins ?? []).length > 0}
    <SizeRangeFacet
      selectedValues={selectedValues.size}
      histogram={facets.size}
      explanation={m.size_explanation()}
      onChange={(min, max) => onChange('size', { min, max })}
    />
  {/if}
{/if}
