<script lang="ts">
  import {
    type DatasetDetailResult,
    type DistributionDetail,
  } from '$lib/services/dataset-detail';
  import * as m from '$lib/paraglide/messages';
  import { getLocale } from '$lib/paraglide/runtime';
  import { RDF_MEDIA_TYPES } from '$lib/constants.js';
  import { onMount } from 'svelte';
  import { initFlowbite } from 'flowbite';
  import { getLocalizedValue, getLocalizedArray } from '$lib/utils/i18n.js';
  import { getLicenseName } from '$lib/utils/license.js';
  import { shortenUri } from '$lib/utils/prefix.js';
  import { getMediaTypeLabel } from '$lib/utils/media-type.js';
  import LanguageBadge from '$lib/components/LanguageBadge.svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { Clipboard, Tooltip } from 'flowbite-svelte';
  import CheckOutline from 'flowbite-svelte-icons/CheckOutline.svelte';
  import ClipboardCleanSolid from 'flowbite-svelte-icons/ClipboardCleanSolid.svelte';
  import ArrowUpRightFromSquareOutline from 'flowbite-svelte-icons/ArrowUpRightFromSquareOutline.svelte';
  import { displayMissingProperties } from '$lib/services/dataset-detail.js';
  import { getRelativeTimeString } from '$lib/utils/relative-time';

  // Data is loaded server-side via +page.ts for SEO
  const { data }: { data: DatasetDetailResult } = $props();
  const { dataset, summary, linksets } = data;

  // Fold-out state for classes table
  const CLASSES_FOLD_LIMIT = 6;
  let classesExpanded = $state(false);

  function isSparqlDistribution(distribution: DistributionDetail) {
    return distribution.conformsTo?.includes(
      'https://www.w3.org/TR/sparql11-protocol/',
    );
  }

  function isRdfDistribution(distribution: DistributionDetail) {
    return (
      distribution.mediaType &&
      RDF_MEDIA_TYPES.includes(
        distribution.mediaType as (typeof RDF_MEDIA_TYPES)[number],
      )
    );
  }

  function formatByteSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024)
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  // Create a Set of verified URLs from both dataDumps and sparqlEndpoint
  const verifiedUrls = $derived.by(() => {
    const urls = new SvelteSet<string>();
    if (summary?.dataDump) {
      for (const dump of summary.dataDump) {
        if (dump.$id) urls.add(dump.$id);
      }
    }
    if (summary?.sparqlEndpoint) {
      urls.add(summary.sparqlEndpoint);
    }
    return urls;
  });

  // Sort distributions: SPARQL first, then RDF (verified first), then others
  const sortedDistributions = $derived(
    dataset.distribution
      ? [...dataset.distribution].sort((a, b) => {
          // Priority: SPARQL (2) > RDF (1) > other (0), then verified first
          const priority = (d: typeof a) => {
            if (isSparqlDistribution(d)) return 2;
            if (isRdfDistribution(d)) return 1;
            return 0;
          };
          const isVerified = (d: typeof a) =>
            d.accessURL && verifiedUrls.has(d.accessURL);

          return (
            priority(b) - priority(a) ||
            Number(isVerified(b)) - Number(isVerified(a))
          );
        })
      : [],
  );

  // Extract keywords and genres for current locale
  const localizedKeywords = getLocalizedArray(dataset.keyword);
  const localizedGenres = getLocalizedArray(dataset.type);

  // Table data for all class partitions
  const classPartitionTable = $derived.by(() => {
    if (!summary?.classPartition?.length) return undefined;

    const sorted = summary.classPartition
      .slice()
      .sort((a, b) => (b.entities || 0) - (a.entities || 0));

    const total = sorted.reduce((sum, p) => sum + (p.entities || 0), 0);

    return {
      rows: sorted.map((p) => {
        const className = p.class || 'Unknown';
        const shortName =
          className.includes('/') || className.includes('#')
            ? className.split(/[/#]/).pop() || className
            : className;
        const entities = p.entities || 0;
        const percent = total > 0 ? (entities / total) * 100 : 0;
        return { className, shortName, entities, percent };
      }),
      total,
    };
  });

  // Displayed class rows based on expansion state
  const displayedClassRows = $derived(
    classesExpanded
      ? classPartitionTable?.rows
      : classPartitionTable?.rows.slice(0, CLASSES_FOLD_LIMIT),
  );

  const hasMoreClasses = $derived(
    (classPartitionTable?.rows.length ?? 0) > CLASSES_FOLD_LIMIT,
  );

  onMount(() => {
    initFlowbite();
  });
</script>

<div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
  {#if dataset}
    <!-- Archived Dataset Warning -->
    {#if dataset.status === 'archived'}
      <div
        class="mb-6 rounded-lg border-l-4 border-yellow-500 bg-yellow-50 p-4 dark:bg-yellow-900/20"
      >
        <div class="flex items-center gap-3">
          <svg
            class="h-6 w-6 text-yellow-600 dark:text-yellow-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <div>
            <h3 class="font-semibold text-yellow-800 dark:text-yellow-200">
              {m.detail_archived_warning()}
            </h3>
            <p class="text-sm text-yellow-700 dark:text-yellow-300">
              {m.detail_archived_message()}
            </p>
          </div>
        </div>
      </div>
    {/if}

    <!-- Dataset Header -->
    <div class="mb-8">
      <h1
        class="mb-4 text-3xl font-bold leading-[1.2] tracking-[-0.02em] text-gray-900 dark:text-white lg:text-4xl"
      >
        {getLocalizedValue(dataset.title)}
        <LanguageBadge values={dataset.title} />
      </h1>

      {#if dataset.description}
        <p
          class="mb-6 text-lg leading-relaxed text-gray-700 dark:text-gray-300 lg:text-xl"
        >
          {getLocalizedValue(dataset.description)}
          <LanguageBadge values={dataset.description} />
        </p>
      {/if}

      <!-- SPARQL Query Button -->
      {#if dataset.distribution}
        {@const sparqlDist = dataset.distribution.find((d) =>
          d.conformsTo?.includes('https://www.w3.org/TR/sparql11-protocol/'),
        )}
        {#if sparqlDist?.accessURL}
          <a
            href="https://yasgui.org/#query=SELECT+*+WHERE+%7B%0A++%3Fsub+%3Fpred+%3Fobj+.%0A%7D+%0ALIMIT+10&endpoint={encodeURIComponent(
              sparqlDist.accessURL,
            )}"
            target="_blank"
            rel="noopener noreferrer"
            class="mb-6 inline-flex items-center gap-2 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 transition-colors"
          >
            <svg
              class="w-5 h-5"
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
            {m.detail_query_dataset()}
          </a>
        {/if}
      {/if}
    </div>

    <!-- Dataset Details Section (compact) -->
    {#if localizedKeywords.length > 0 || dataset.publisher?.name || dataset.license || (dataset.spatial && dataset.spatial.length > 0) || dataset.temporal || localizedGenres.length > 0 || (dataset.language && dataset.language.length > 0)}
      <div class="mb-8">
        <div
          class="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
        >
          <dl class="divide-y divide-gray-200 dark:divide-gray-700">
            <!-- URI -->
            <div
              class="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4"
            >
              <dt
                class="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2"
              >
                <svg
                  class="h-5 w-5 text-gray-500 dark:text-gray-400 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                  />
                </svg>
                {m.detail_uri()}
              </dt>
              <dd class="text-sm flex items-center gap-2">
                <a
                  href={dataset.$id}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="truncate text-blue-600 hover:underline dark:text-blue-400"
                >
                  {dataset.$id}
                </a>
                <Clipboard value={dataset.$id}>
                  {#snippet children(success)}
                    <Tooltip
                      >{success ? m.detail_copied() : m.detail_copy()}</Tooltip
                    >
                    {#if success}<CheckOutline
                        class="text-gray-500 dark:text-gray-400"
                      />{:else}<ClipboardCleanSolid
                        class="text-gray-500 dark:text-gray-400"
                      />{/if}
                  {/snippet}
                </Clipboard>
              </dd>
            </div>

            <!-- Publisher -->
            {#if dataset.publisher?.name}
              <div
                class="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4"
              >
                <dt
                  class="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2"
                >
                  <svg
                    class="h-5 w-5 text-gray-500 dark:text-gray-400 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                    />
                  </svg>
                  {m.detail_publisher()}
                </dt>
                <dd class="text-sm text-gray-700 dark:text-gray-300">
                  <a
                    href="/datasets?publishers={encodeURIComponent(
                      dataset.publisher.$id || '',
                    )}"
                    class="text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {getLocalizedValue(dataset.publisher.name)}
                  </a>
                  {#if dataset.publisher.nick}
                    <span class="text-gray-500 dark:text-gray-400"
                      >({getLocalizedValue(dataset.publisher.nick)})</span
                    >
                  {/if}
                  <LanguageBadge values={dataset.publisher.name} />
                  {#if dataset.publisher.email || dataset.publisher.sameAs}
                    <div
                      class="mt-1.5 flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400"
                    >
                      {#if dataset.publisher.email}
                        <a
                          href="mailto:{dataset.publisher.email}"
                          class="inline-flex items-center gap-1.5 hover:text-blue-600 dark:hover:text-blue-400"
                        >
                          <svg
                            class="h-3.5 w-3.5 flex-shrink-0"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                            />
                          </svg>
                          <span class="break-all"
                            >{dataset.publisher.email.replace(
                              'mailto:',
                              '',
                            )}</span
                          >
                        </a>
                      {/if}
                      {#if dataset.publisher.sameAs}
                        <a
                          href={dataset.publisher.sameAs}
                          target="_blank"
                          rel="noopener noreferrer"
                          class="inline-flex items-center gap-1.5 hover:text-blue-600 dark:hover:text-blue-400"
                        >
                          <svg
                            class="h-3.5 w-3.5 flex-shrink-0"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                          </svg>
                          <span class="break-all"
                            >{dataset.publisher.sameAs}</span
                          >
                        </a>
                      {/if}
                    </div>
                  {/if}
                </dd>
              </div>
            {/if}

            <!-- Creator -->
            {#if dataset.creator && dataset.creator.length > 0}
              <div
                class="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4"
              >
                <dt
                  class="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2"
                >
                  <svg
                    class="h-5 w-5 text-gray-500 dark:text-gray-400 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                  {m.detail_creator()}
                </dt>
                <dd class="text-sm text-gray-700 dark:text-gray-300">
                  {#each dataset.creator as creator, index (creator)}
                    <span>
                      <a
                        href={creator.$id}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="text-blue-600 hover:underline dark:text-blue-400"
                      >
                        {getLocalizedValue(creator.name)}
                      </a>
                      <LanguageBadge values={creator.name} />
                    </span>{#if index < dataset.creator.length - 1},&nbsp;{/if}
                  {/each}
                </dd>
              </div>
            {/if}

            <!-- Catalog -->
            {#if dataset.isPartOf?.title}
              <div
                class="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4"
              >
                <dt
                  class="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2"
                >
                  <svg
                    class="h-5 w-5 text-gray-500 dark:text-gray-400 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                    />
                  </svg>
                  {m.detail_catalog()}
                </dt>
                <dd class="text-sm text-gray-700 dark:text-gray-300">
                  <a
                    href={dataset.isPartOf.$id}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {getLocalizedValue(dataset.isPartOf.title)}
                  </a>
                  <LanguageBadge values={dataset.isPartOf.title} />
                </dd>
              </div>
            {/if}

            <!-- Landing Page -->
            {#if dataset.landingPage}
              <div
                class="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4"
              >
                <dt
                  class="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2"
                >
                  <ArrowUpRightFromSquareOutline
                    class="h-5 w-5 flex-shrink-0 text-gray-500 dark:text-gray-400"
                  />
                  {m.detail_landing_page()}
                </dt>
                <dd class="text-sm truncate">
                  <a
                    href={dataset.landingPage}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
                    title={dataset.landingPage}
                  >
                    {dataset.landingPage}
                    <ArrowUpRightFromSquareOutline class="h-3 w-3 shrink-0" />
                  </a>
                </dd>
              </div>
            {/if}

            <!-- License -->
            {#if dataset.license}
              <div
                class="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4"
              >
                <dt
                  class="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2"
                >
                  <svg
                    class="h-5 w-5 text-gray-500 dark:text-gray-400 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    />
                  </svg>
                  {m.detail_license()}
                </dt>
                <dd class="text-sm truncate">
                  <a
                    href={dataset.license}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-blue-600 hover:underline dark:text-blue-400"
                    title={dataset.license}
                  >
                    {getLicenseName(dataset.license)}
                  </a>
                </dd>
              </div>
            {/if}

            <!-- Spatial Coverage -->
            {#if dataset.spatial && dataset.spatial.length > 0}
              <div
                class="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4"
              >
                <dt
                  class="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2"
                >
                  <svg
                    class="h-5 w-5 text-gray-500 dark:text-gray-400 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  {m.detail_spatial_coverage()}
                </dt>
                <dd class="text-sm text-gray-700 dark:text-gray-300 break-all">
                  {dataset.spatial.join(', ')}
                </dd>
              </div>
            {/if}

            <!-- Temporal Coverage -->
            {#if dataset.temporal}
              <div
                class="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4"
              >
                <dt
                  class="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2"
                >
                  <svg
                    class="h-5 w-5 text-gray-500 dark:text-gray-400 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  {m.detail_temporal_coverage()}
                </dt>
                <dd class="text-sm text-gray-700 dark:text-gray-300">
                  {dataset.temporal}
                </dd>
              </div>
            {/if}

            <!-- Language -->
            {#if dataset.language && dataset.language.length > 0}
              <div
                class="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4"
              >
                <dt
                  class="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2"
                >
                  <svg
                    class="h-5 w-5 text-gray-500 dark:text-gray-400 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
                    />
                  </svg>
                  {m.dataset_languages()}
                </dt>
                <dd class="text-sm text-gray-700 dark:text-gray-300">
                  {dataset.language.join(', ')}
                </dd>
              </div>
            {/if}

            <!-- Genre -->
            {#if localizedGenres.length > 0}
              <div
                class="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4"
              >
                <dt
                  class="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2"
                >
                  <svg
                    class="h-5 w-5 text-gray-500 dark:text-gray-400 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
                    />
                  </svg>
                  {m.detail_genres()}
                </dt>
                <dd class="text-sm text-gray-700 dark:text-gray-300">
                  {localizedGenres.join(', ')}
                </dd>
              </div>
            {/if}

            <!-- Keywords -->
            {#if localizedKeywords.length > 0}
              <div
                class="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4"
              >
                <dt
                  class="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2"
                >
                  <svg
                    class="h-5 w-5 text-gray-500 dark:text-gray-400 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                    />
                  </svg>
                  {m.detail_keywords()}
                </dt>
                <dd class="flex flex-wrap gap-1.5">
                  {#each localizedKeywords as keyword (keyword)}
                    <a
                      href="/datasets?keywords={encodeURIComponent(keyword)}"
                      class="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 transition-colors hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-200 dark:hover:bg-blue-900/50 no-underline"
                    >
                      {keyword}
                    </a>
                  {/each}
                </dd>
              </div>
            {/if}

            <!-- Issued -->
            {#if dataset.issued}
              <div
                class="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4"
              >
                <dt
                  class="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2"
                >
                  <svg
                    class="h-5 w-5 text-gray-500 dark:text-gray-400 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  {m.detail_issued()}
                </dt>
                <dd class="text-sm text-gray-700 dark:text-gray-300">
                  {new Date(dataset.issued).toLocaleDateString(getLocale(), {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </dd>
              </div>
            {/if}

            <!-- Modified -->
            {#if dataset.modified}
              <div
                class="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4"
              >
                <dt
                  class="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2"
                >
                  <svg
                    class="h-5 w-5 text-gray-500 dark:text-gray-400 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  {m.detail_modified()}
                </dt>
                <dd class="text-sm text-gray-700 dark:text-gray-300">
                  {new Date(dataset.modified).toLocaleDateString(getLocale(), {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </dd>
              </div>
            {/if}
          </dl>
        </div>
      </div>
    {/if}

    <!-- Distributions Section -->
    {#if sortedDistributions.length > 0}
      <div class="mb-8">
        <h2
          class="mb-4 flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-white"
        >
          <svg
            class="w-5 h-5 text-gray-600 dark:text-gray-400"
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
          {m.detail_distributions()}
          <button
            data-tooltip-target="tooltip-distributions"
            data-tooltip-placement="bottom"
            type="button"
            class="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
          >
            <svg
              class="h-4 w-4"
              aria-hidden="true"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fill-rule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z"
                clip-rule="evenodd"
              ></path>
            </svg>
            <span class="sr-only">{m.detail_show_info()}</span>
          </button>
          <div
            id="tooltip-distributions"
            role="tooltip"
            class="tooltip invisible absolute z-10 inline-block max-w-xs rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white opacity-0 shadow-sm transition-opacity duration-300 dark:bg-gray-700"
          >
            {m.detail_distributions_tooltip()}
            <div class="tooltip-arrow" data-popper-arrow></div>
          </div>
        </h2>
        <div
          class="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white dark:divide-gray-700 dark:border-gray-700 dark:bg-gray-800"
        >
          {#each sortedDistributions as distribution, distIndex (distribution.$id)}
            {@const isVerified =
              distribution.accessURL &&
              verifiedUrls.has(distribution.accessURL)}
            {@const isSparql = isSparqlDistribution(distribution)}
            <div class="flex flex-wrap items-center gap-3 px-4 py-3">
              <!-- Type badge -->
              <div class="w-20 flex-shrink-0">
                {#if isSparql}
                  <span
                    class="inline-flex w-full items-center justify-center rounded bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800 dark:bg-purple-900/30 dark:text-purple-300"
                  >
                    SPARQL
                  </span>
                {:else if distribution.mediaType}
                  <span
                    class="inline-flex w-full items-center justify-center truncate rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-800 dark:bg-gray-700 dark:text-gray-300"
                    title={distribution.mediaType}
                  >
                    {getMediaTypeLabel(distribution.mediaType)}
                  </span>
                {/if}
              </div>

              <!-- Title, URL, and Description -->
              <div class="min-w-0 flex-1">
                {#if distribution.title}
                  <div
                    class="text-sm font-medium text-gray-900 dark:text-white"
                  >
                    {getLocalizedValue(distribution.title)}
                  </div>
                {/if}
                {#if distribution.accessURL}
                  <a
                    href={isSparql
                      ? `https://yasgui.org/#query=SELECT+*+WHERE+%7B%0A++%3Fsub+%3Fpred+%3Fobj+.%0A%7D+%0ALIMIT+10&endpoint=${encodeURIComponent(distribution.accessURL)}`
                      : distribution.accessURL}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="block truncate text-sm text-blue-600 hover:underline dark:text-blue-400"
                    title={isSparql
                      ? `Query in YASGUI: ${distribution.accessURL}`
                      : distribution.accessURL}
                  >
                    {distribution.accessURL}
                  </a>
                {/if}
                {#if distribution.description}
                  <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {getLocalizedValue(distribution.description)}
                  </p>
                {/if}
                {#if distribution.issued || distribution.modified || distribution.byteSize}
                  <div
                    class="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400"
                  >
                    {#if distribution.issued}
                      <span
                        >{m.detail_issued()}: {new Date(
                          distribution.issued,
                        ).toLocaleDateString(getLocale())}</span
                      >
                    {/if}
                    {#if distribution.modified}
                      <span
                        >{m.detail_modified()}: {new Date(
                          distribution.modified,
                        ).toLocaleDateString(getLocale())}</span
                      >
                    {/if}
                    {#if distribution.byteSize}
                      <span
                        >{m.detail_file_size()}: {formatByteSize(
                          distribution.byteSize,
                        )}</span
                      >
                    {/if}
                  </div>
                {/if}
              </div>

              <!-- Action buttons -->
              <div class="flex flex-shrink-0 items-center gap-1">
                {#if isVerified}
                  <button
                    type="button"
                    data-tooltip-target="tooltip-verified-{distIndex}"
                    data-tooltip-placement="bottom"
                    class="group relative inline-flex cursor-help items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  >
                    <svg
                      class="h-3 w-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    {m.detail_verified()}
                  </button>
                  <div
                    id="tooltip-verified-{distIndex}"
                    role="tooltip"
                    class="tooltip invisible absolute z-10 inline-block max-w-xs rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white opacity-0 shadow-sm transition-opacity duration-300 dark:bg-gray-700"
                  >
                    {m.detail_verified_tooltip()}
                    <div class="tooltip-arrow" data-popper-arrow></div>
                  </div>
                {/if}

                {#if distribution.accessURL}
                  <Clipboard value={distribution.accessURL}>
                    {#snippet children(success)}
                      <Tooltip
                        >{success
                          ? m.detail_copied()
                          : m.detail_copy()}</Tooltip
                      >
                      {#if success}<CheckOutline
                          class="text-gray-500 dark:text-gray-400"
                        />{:else}<ClipboardCleanSolid
                          class="text-gray-500 dark:text-gray-400"
                        />{/if}
                    {/snippet}
                  </Clipboard>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- VoID Summary Section -->
    {@const hasVoidStats =
      summary &&
      (summary.triples != null ||
        summary.distinctSubjects != null ||
        summary.properties != null ||
        summary.distinctObjectsURI != null ||
        summary.distinctObjectsLiteral != null ||
        (summary.classPartition && summary.classPartition.length > 0) ||
        (summary.vocabulary && summary.vocabulary.length > 0))}
    {#if hasVoidStats}
      <div class="mb-8">
        <h2
          class="mb-4 flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-white"
        >
          {m.detail_linked_data_summary()}
          <button
            data-tooltip-target="tooltip-linked-data-summary"
            data-tooltip-placement="bottom"
            type="button"
            class="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
          >
            <svg
              class="h-4 w-4"
              aria-hidden="true"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fill-rule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z"
                clip-rule="evenodd"
              ></path>
            </svg>
            <span class="sr-only">{m.detail_show_info()}</span>
          </button>
          <div
            id="tooltip-linked-data-summary"
            role="tooltip"
            class="tooltip invisible absolute z-10 inline-block max-w-xs rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white opacity-0 shadow-sm transition-opacity duration-300 dark:bg-gray-700"
          >
            {m.detail_linked_data_summary_description()}
            <div class="tooltip-arrow" data-popper-arrow></div>
          </div>
        </h2>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <!-- Merged: Triples + Subjects + Avg Triples Per Subject -->
          {#if (summary.triples !== undefined && summary.triples !== null) || (summary.distinctSubjects !== undefined && summary.distinctSubjects !== null)}
            <div
              class="rounded-lg border border-gray-200 bg-white p-4 shadow dark:border-gray-700 dark:bg-gray-800"
            >
              <div class="space-y-3">
                {#if summary.triples !== undefined && summary.triples !== null}
                  <div>
                    <div
                      class="text-3xl font-bold text-gray-900 dark:text-white"
                    >
                      {summary.triples.toLocaleString(getLocale())}
                    </div>
                    <div class="text-sm text-gray-600 dark:text-gray-400">
                      {m.detail_triples()}
                    </div>
                  </div>
                {/if}
                {#if summary.distinctSubjects !== undefined && summary.distinctSubjects !== null}
                  <div
                    class="border-t border-gray-200 dark:border-gray-700 pt-3"
                  >
                    <div
                      class="text-3xl font-bold text-gray-900 dark:text-white"
                    >
                      {summary.distinctSubjects.toLocaleString(getLocale())}
                    </div>
                    <div class="text-sm text-gray-600 dark:text-gray-400">
                      {m.detail_subjects()}
                    </div>
                  </div>
                {/if}
                {#if summary.triples !== undefined && summary.triples !== null && summary.distinctSubjects !== undefined && summary.distinctSubjects !== null && summary.distinctSubjects > 0}
                  <div
                    class="border-t border-gray-200 dark:border-gray-700 pt-3"
                  >
                    <div
                      class="text-2xl font-semibold text-blue-700 dark:text-blue-300"
                    >
                      {(
                        summary.triples / summary.distinctSubjects
                      ).toLocaleString(getLocale(), {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })}
                    </div>
                    <div class="text-xs text-gray-600 dark:text-gray-400">
                      {m.detail_avg_triples_per_subject()}
                    </div>
                  </div>
                {/if}
              </div>
            </div>
          {/if}

          {#if summary.properties !== undefined && summary.properties !== null}
            <div
              class="rounded-lg border border-gray-200 bg-white p-4 shadow dark:border-gray-700 dark:bg-gray-800"
            >
              <div class="text-3xl font-bold text-gray-900 dark:text-white">
                {summary.properties.toLocaleString(getLocale())}
              </div>
              <div class="text-sm text-gray-600 dark:text-gray-400">
                {m.detail_properties()}
              </div>
            </div>
          {/if}

          {#if summary.distinctObjectsURI !== undefined || summary.distinctObjectsLiteral !== undefined}
            {@const totalObjects =
              (summary.distinctObjectsURI || 0) +
              (summary.distinctObjectsLiteral || 0)}
            {@const literalsCount = summary.distinctObjectsLiteral || 0}
            {@const urisCount = summary.distinctObjectsURI || 0}
            {@const literalsPercent =
              totalObjects > 0 ? (literalsCount / totalObjects) * 100 : 0}
            {@const urisPercent =
              totalObjects > 0 ? (urisCount / totalObjects) * 100 : 0}
            {#if totalObjects > 0}
              <div
                class="rounded-lg border border-gray-200 bg-white p-4 shadow dark:border-gray-700 dark:bg-gray-800"
              >
                <div class="text-3xl font-bold text-gray-900 dark:text-white">
                  {totalObjects.toLocaleString(getLocale())}
                </div>
                <div class="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  {m.detail_objects()}
                </div>

                <!-- Horizontal bar chart -->
                <div class="mt-4 space-y-3">
                  <div class="flex h-8 overflow-hidden rounded-lg">
                    {#if literalsCount > 0}
                      <div
                        class="flex items-center justify-center bg-blue-500 text-white text-xs font-semibold tabular-nums transition-all"
                        style="width: {literalsPercent}%"
                        title="{m.detail_literals()}: {literalsCount.toLocaleString(
                          getLocale(),
                        )} ({literalsPercent.toLocaleString(getLocale(), {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 1,
                        })}%)"
                      >
                        {#if literalsPercent > 10}
                          {literalsPercent.toLocaleString(getLocale(), {
                            maximumFractionDigits: 0,
                          })}%
                        {/if}
                      </div>
                    {/if}
                    {#if urisCount > 0}
                      <div
                        class="flex items-center justify-center bg-cyan-500 text-white text-xs font-semibold tabular-nums transition-all"
                        style="width: {urisPercent}%"
                        title="{m.detail_uris()}: {urisCount.toLocaleString(
                          getLocale(),
                        )} ({urisPercent.toLocaleString(getLocale(), {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 1,
                        })}%)"
                      >
                        {#if urisPercent > 10}
                          {urisPercent.toLocaleString(getLocale(), {
                            maximumFractionDigits: 0,
                          })}%
                        {/if}
                      </div>
                    {/if}
                  </div>

                  <!-- Legend -->
                  <div class="flex flex-wrap gap-4 text-xs">
                    <div class="flex items-center gap-2">
                      <div class="h-3 w-3 rounded bg-blue-500"></div>
                      <span class="text-gray-700 dark:text-gray-300">
                        {m.detail_literals()}: {literalsCount.toLocaleString(
                          getLocale(),
                        )}
                      </span>
                    </div>
                    <div class="flex items-center gap-2">
                      <div class="h-3 w-3 rounded bg-cyan-500"></div>
                      <span class="text-gray-700 dark:text-gray-300">
                        {m.detail_uris()}: {urisCount.toLocaleString(
                          getLocale(),
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            {/if}
          {/if}
        </div>

        <!-- Classes Section -->
        {#if classPartitionTable}
          <div class="mt-6">
            <div class="mb-4 flex items-center justify-between">
              <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                {m.detail_classes()}
              </h3>
            </div>
            <p class="mb-4 text-sm text-gray-600 dark:text-gray-400">
              {m.detail_classes_description()}
            </p>

            <div
              class="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white dark:divide-gray-700 dark:border-gray-700 dark:bg-gray-800 {classesExpanded
                ? 'max-h-[400px] overflow-y-auto'
                : ''}"
            >
              <!-- Header row -->
              <div
                class="flex items-center gap-4 px-4 py-3 bg-gray-100 dark:bg-gray-700 {classesExpanded
                  ? 'sticky top-0'
                  : ''} rounded-t-lg text-xs font-medium uppercase text-gray-700 dark:text-gray-300"
              >
                <div class="flex-1">{m.detail_class()}</div>
                <div class="w-24 text-right">{m.detail_entities()}</div>
                <div class="w-36">%</div>
              </div>
              <!-- Data rows -->
              {#each displayedClassRows ?? [] as row (row.className)}
                <div class="flex items-center gap-4 px-4 py-3 text-sm">
                  <div class="flex-1 min-w-0 truncate">
                    <a
                      href={row.className}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-blue-600 hover:underline dark:text-blue-400"
                      title={row.className}
                    >
                      {shortenUri(row.className)}
                    </a>
                  </div>
                  <div
                    class="w-24 text-right tabular-nums text-gray-700 dark:text-gray-300"
                  >
                    {row.entities.toLocaleString(getLocale())}
                  </div>
                  <div class="w-36 flex items-center gap-2">
                    <div
                      class="flex-1 h-2 bg-gray-200 rounded-full dark:bg-gray-600"
                    >
                      <div
                        class="h-2 bg-blue-600 rounded-full"
                        style="width: {row.percent}%"
                      ></div>
                    </div>
                    <span
                      class="text-xs w-12 text-right tabular-nums text-gray-600 dark:text-gray-400"
                      >{row.percent.toLocaleString(getLocale(), {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })}%</span
                    >
                  </div>
                </div>
              {/each}
            </div>

            {#if hasMoreClasses}
              <button
                class="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium transition-colors cursor-pointer"
                onclick={() => (classesExpanded = !classesExpanded)}
                type="button"
              >
                {classesExpanded ? m.facets_show_less() : m.facets_show_more()}
              </button>
            {/if}
          </div>
        {/if}

        <!-- Vocabularies Section -->
        {#if summary.vocabulary && summary.vocabulary.length > 0}
          <div class="mt-6">
            <h3
              class="mb-3 text-lg font-semibold text-gray-900 dark:text-white"
            >
              {m.detail_vocabularies()}
            </h3>
            <ul class="space-y-2">
              {#each summary.vocabulary as vocab (vocab)}
                <li class="flex items-center gap-2 text-sm">
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
                      d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                    />
                  </svg>
                  <a
                    href={vocab}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-blue-600 hover:underline dark:text-blue-400 break-all"
                  >
                    {vocab}
                  </a>
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Terminology Sources Section -->
    {#if linksets.length > 0}
      <div class="mb-8">
        <h2 class="mb-4 text-xl font-semibold text-gray-900 dark:text-white">
          {m.detail_terminology_sources()}
        </h2>
        <div class="space-y-3">
          {#each linksets as linkset (linkset.$id)}
            {#if linkset.objectsTarget}
              <div
                class="flex items-center justify-between rounded-lg border border-gray-200 p-4 dark:border-gray-700"
              >
                <div class="flex items-center gap-3 flex-1 min-w-0">
                  <svg
                    class="w-5 h-5 text-gray-600 dark:text-gray-400 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                    />
                  </svg>
                  <a
                    href={linkset.objectsTarget}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-blue-600 hover:underline dark:text-blue-400 truncate"
                  >
                    {linkset.objectsTarget}
                  </a>
                </div>
                {#if linkset.triples !== undefined && linkset.triples !== null}
                  <div
                    class="ml-4 flex-shrink-0 rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                  >
                    {linkset.triples.toLocaleString(getLocale())}
                    {m.dataset_triples({ count: linkset.triples })}
                  </div>
                {/if}
              </div>
            {/if}
          {/each}
        </div>
      </div>
    {/if}

    <!-- Registratio Section -->
    <div class="mb-8">
      <h2 class="mb-4 text-xl font-semibold text-gray-900 dark:text-white">
        {m.detail_registration()}
      </h2>
      <div
        class="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
      >
        <dl class="divide-y divide-gray-200 dark:divide-gray-700">
          {#if dataset.subjectOf}
            <div
              class="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4"
            >
              <dt
                class="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-1"
              >
                {m.detail_registered_url()}
                <button
                  data-tooltip-target="tooltip-registered-url"
                  data-tooltip-placement="bottom"
                  type="button"
                  class="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                >
                  <svg
                    class="h-4 w-4"
                    aria-hidden="true"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fill-rule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z"
                      clip-rule="evenodd"
                    ></path>
                  </svg>
                  <span class="sr-only">{m.detail_show_info()}</span>
                </button>
                <div
                  id="tooltip-registered-url"
                  role="tooltip"
                  class="tooltip invisible absolute z-10 inline-block max-w-xs rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white opacity-0 shadow-sm transition-opacity duration-300 dark:bg-gray-700"
                >
                  {m.detail_registered_url_description()}
                  <div class="tooltip-arrow" data-popper-arrow></div>
                </div>
              </dt>
              <dd class="text-sm text-gray-700 dark:text-gray-300">
                <div class="flex flex-wrap items-center gap-2">
                  <a
                    href={dataset.subjectOf.$id}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-blue-600 hover:underline dark:text-blue-400 break-all"
                  >
                    {dataset.subjectOf.$id}
                  </a>
                  <a
                    href="https://datasetregister.netwerkdigitaalerfgoed.nl/validate.php?url={encodeURIComponent(
                      dataset.subjectOf.$id,
                    )}"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex flex-shrink-0 items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium text-white transition-colors {dataset
                      .subjectOf.validUntil
                      ? 'bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600'
                      : 'bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600'}"
                  >
                    <svg
                      class="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    {dataset.subjectOf.validUntil
                      ? m.detail_invalid()
                      : m.detail_valid()}
                  </a>
                </div>
              </dd>
            </div>
          {/if}

          {#if dataset.subjectOf?.datePosted}
            <div
              class="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4"
            >
              <dt
                class="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-1"
              >
                {m.detail_registered()}
                <button
                  data-tooltip-target="tooltip-registered"
                  data-tooltip-placement="bottom"
                  type="button"
                  class="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                >
                  <svg
                    class="h-4 w-4"
                    aria-hidden="true"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fill-rule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z"
                      clip-rule="evenodd"
                    ></path>
                  </svg>
                  <span class="sr-only">{m.detail_show_info()}</span>
                </button>
                <div
                  id="tooltip-registered"
                  role="tooltip"
                  class="tooltip invisible absolute z-10 inline-block max-w-xs rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white opacity-0 shadow-sm transition-opacity duration-300 dark:bg-gray-700"
                >
                  {m.detail_registered_description()}
                  <div class="tooltip-arrow" data-popper-arrow></div>
                </div>
              </dt>
              <dd class="text-sm text-gray-700 dark:text-gray-300">
                {new Date(dataset.subjectOf.datePosted).toLocaleDateString(
                  getLocale(),
                  {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  },
                )}
              </dd>
            </div>
          {/if}

          {#if dataset.subjectOf?.dateRead}
            <div
              class="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4"
            >
              <dt
                class="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-1"
              >
                {m.detail_last_crawled()}
                <button
                  data-tooltip-target="tooltip-last-crawled"
                  data-tooltip-placement="bottom"
                  type="button"
                  class="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                >
                  <svg
                    class="h-4 w-4"
                    aria-hidden="true"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fill-rule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z"
                      clip-rule="evenodd"
                    ></path>
                  </svg>
                  <span class="sr-only">{m.detail_show_info()}</span>
                </button>
                <div
                  id="tooltip-last-crawled"
                  role="tooltip"
                  class="tooltip invisible absolute z-10 inline-block max-w-xs rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white opacity-0 shadow-sm transition-opacity duration-300 dark:bg-gray-700"
                >
                  {m.detail_last_crawled_description()}
                  <div class="tooltip-arrow" data-popper-arrow></div>
                </div>
              </dt>
              <dd class="text-sm text-gray-700 dark:text-gray-300">
                <span id="dateread-relative">
                  {getRelativeTimeString(dataset.subjectOf.dateRead)}
                </span>
                <Tooltip triggeredBy="#dateread-relative">
                  {new Date(dataset.subjectOf.dateRead).toLocaleDateString(
                    getLocale(),
                    {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    },
                  )}
                </Tooltip>
              </dd>
            </div>
          {/if}

          {#if dataset.contentRating?.ratingValue !== undefined}
            <div
              class="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4"
            >
              <dt
                class="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-1"
              >
                {m.detail_quality_rating()}
                <button
                  data-tooltip-target="tooltip-quality-rating"
                  data-tooltip-placement="bottom"
                  type="button"
                  class="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                >
                  <svg
                    class="h-4 w-4"
                    aria-hidden="true"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fill-rule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z"
                      clip-rule="evenodd"
                    ></path>
                  </svg>
                  <span class="sr-only">{m.detail_show_info()}</span>
                </button>
                <div
                  id="tooltip-quality-rating"
                  role="tooltip"
                  class="tooltip invisible absolute z-10 inline-block max-w-xs rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white opacity-0 shadow-sm transition-opacity duration-300 dark:bg-gray-700"
                >
                  {m.detail_quality_rating_description()}
                  <div class="tooltip-arrow" data-popper-arrow></div>
                </div>
              </dt>
              <dd class="text-sm text-gray-700 dark:text-gray-300">
                <div class="flex items-center gap-3">
                  <div class="flex items-center gap-2">
                    <div
                      class="h-2 w-24 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
                    >
                      <div
                        class="h-full rounded-full bg-green-600 dark:bg-green-500 transition-all duration-500"
                        style="width: {dataset.contentRating.ratingValue}%"
                      ></div>
                    </div>
                    <span class="font-semibold text-gray-900 dark:text-white"
                      >{dataset.contentRating.ratingValue}%</span
                    >
                  </div>
                </div>
                {#if dataset.contentRating.ratingExplanation}
                  <div class="mt-2 flex flex-wrap gap-1.5">
                    {m.missing_properties()}:
                    {#each displayMissingProperties(dataset.contentRating.ratingExplanation) as prop (prop)}
                      <span
                        class="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-400"
                      >
                        {prop}
                      </span>
                    {/each}
                  </div>
                {/if}
              </dd>
            </div>
          {/if}
        </dl>
      </div>
    </div>
  {/if}
</div>
