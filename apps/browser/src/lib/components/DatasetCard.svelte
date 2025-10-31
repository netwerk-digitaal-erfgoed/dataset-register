<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { getLocale } from '$lib/paraglide/runtime';
  import { type DatasetCard } from '$lib/services/datasets';
  import { getLocalizedValue } from '$lib/utils/i18n';
  import { RDF_MEDIA_TYPES } from '$lib/constants.js';
  import { formatNumber } from '$lib/services/facets';

  let { dataset }: { dataset: DatasetCard } = $props();

  const languages = $derived(
    dataset.language.map((lang) => {
      const key: keyof typeof m = `lang_${lang}` as keyof typeof m;
      // Try to get translation, fall back to original language code.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (m as any)[key]?.() ?? lang;
    }),
  );

  const detailUrl = $derived(
    `https://datasetregister.netwerkdigitaalerfgoed.nl/show.php?lang=${getLocale()}&uri=${encodeURIComponent(dataset.$id)}`,
  );

  const hasSparqlDistribution = $derived(
    dataset.distribution.some((distribution) =>
      distribution.conformsTo.includes(
        'https://www.w3.org/TR/sparql11-protocol/',
      ),
    ),
  );

  const hasRdfDistribution = $derived(
    dataset.distribution.some(
      (distribution) =>
        distribution.mediaType !== null &&
        RDF_MEDIA_TYPES.includes(
          distribution.mediaType as (typeof RDF_MEDIA_TYPES)[number],
        ),
    ),
  );
</script>

<a
  class="relative block border border-gray-300 dark:border-gray-700 rounded-lg p-6 bg-white dark:bg-gray-800 transition-all hover:shadow-lg hover:border-gray-400 dark:hover:border-gray-600 cursor-pointer no-underline overflow-hidden"
  href={detailUrl}
  rel="external"
>
  {#if dataset.status}
    <div
      class="absolute top-0 right-0 overflow-hidden w-32 h-32 pointer-events-none"
    >
      <div
        class="absolute top-7 -right-10 w-48 py-2 flex items-center justify-center text-white text-xs font-bold uppercase tracking-wider transform rotate-45 bg-red-600 dark:bg-red-700 shadow-lg"
      >
        {#if dataset.status === 'archived'}
          {m.dataset_status_archived()}
        {/if}
      </div>
    </div>
  {/if}

  <h2
    class="m-0 mb-4 text-[1.375rem] font-semibold text-gray-900 dark:text-gray-100 leading-[1.4] tracking-[-0.015em]"
  >
    {getLocalizedValue(dataset.title)}
  </h2>

  {#if dataset.description}
    <p class="mb-4 line-clamp-5 text-gray-700 dark:text-gray-300">
      {getLocalizedValue(dataset.description)}
    </p>
  {/if}

  {#if dataset.publisher}
    <div class="mb-2.5 text-[0.9375rem] leading-[1.5] flex items-center gap-2">
      <svg
        class="w-4 h-4 text-gray-600 dark:text-gray-400 flex-shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-label={m.dataset_publisher()}
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
        ></path>
      </svg>
      <span class="text-gray-700 dark:text-gray-300"
        >{getLocalizedValue(dataset.publisher.name)}</span
      >
    </div>
  {/if}

  {#if languages.length > 0}
    <div class="mb-2.5 text-[0.9375rem] leading-[1.5] flex items-center gap-2">
      <svg
        class="w-4 h-4 text-gray-600 dark:text-gray-400 flex-shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-label={m.dataset_languages()}
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
        ></path>
      </svg>
      <span class="text-gray-700 dark:text-gray-300"
        >{languages.join(', ')}</span
      >
    </div>
  {/if}

  {#if hasSparqlDistribution || hasRdfDistribution || dataset.size}
    <div class="mt-2.5 text-[0.9375rem] leading-[1.5] flex items-center gap-4">
      {#if hasSparqlDistribution}
        <div class="group relative flex items-center gap-1.5">
          <div
            class="invisible absolute bottom-full left-1/2 mb-2 -translate-x-1/2 transform rounded bg-gray-800 px-2 py-1 text-xs whitespace-nowrap text-white opacity-0 transition-opacity duration-200 group-hover:visible group-hover:opacity-100"
          >
            {m.distribution_sparql()}
            <div
              class="absolute top-full left-1/2 h-0 w-0 -translate-x-1/2 border-t-4 border-r-4 border-l-4 border-t-gray-800 border-r-transparent border-l-transparent"
            ></div>
          </div>
          <svg
            class="w-4 h-4 text-gray-600 dark:text-gray-400 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <span class="text-gray-700 dark:text-gray-300">SPARQL</span>
        </div>
      {/if}

      {#if hasRdfDistribution}
        <div class="group relative flex items-center gap-1.5">
          <div
            class="invisible absolute bottom-full left-1/2 mb-2 -translate-x-1/2 transform rounded bg-gray-800 px-2 py-1 text-xs whitespace-nowrap text-white opacity-0 transition-opacity duration-200 group-hover:visible group-hover:opacity-100"
          >
            {m.distribution_rdf()}
            <div
              class="absolute top-full left-1/2 h-0 w-0 -translate-x-1/2 border-t-4 border-r-4 border-l-4 border-t-gray-800 border-r-transparent border-l-transparent"
            ></div>
          </div>
          <svg
            class="w-4 h-4 text-gray-600 dark:text-gray-400 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <span class="text-gray-700 dark:text-gray-300">RDF</span>
        </div>
      {/if}

      {#if dataset.size}
        <div class="group relative flex items-center gap-1.5">
          <div
            class="invisible absolute bottom-full left-1/2 mb-2 -translate-x-1/2 transform rounded bg-gray-800 px-2 py-1 text-xs whitespace-nowrap text-white opacity-0 transition-opacity duration-200 group-hover:visible group-hover:opacity-100"
          >
            {m.dataset_size()}
            <div
              class="absolute top-full left-1/2 h-0 w-0 -translate-x-1/2 border-t-4 border-r-4 border-l-4 border-t-gray-800 border-r-transparent border-l-transparent"
            ></div>
          </div>
          <svg
            class="w-4 h-4 text-gray-600 dark:text-gray-400 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <!-- RDF triple graph: 3 nodes connected in triangle -->
            <circle cx="6" cy="8" r="2" stroke-width="2" />
            <circle cx="18" cy="8" r="2" stroke-width="2" />
            <circle cx="12" cy="16" r="2" stroke-width="2" />
            <path
              stroke-linecap="round"
              stroke-width="2"
              d="M8 8L16 8M17 9L13 15M11 15L7 9"
            ></path>
          </svg>
          <span class="text-gray-700 dark:text-gray-300"
            >{formatNumber(dataset.size, getLocale())}
            {m.dataset_triples({ count: dataset.size })}</span
          >
        </div>
      {/if}
    </div>
  {/if}
</a>
