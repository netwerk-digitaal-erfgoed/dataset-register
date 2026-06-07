<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { getLocale } from '$lib/paraglide/runtime';
  import { Tooltip } from 'flowbite-svelte';
  import CheckOutline from 'flowbite-svelte-icons/CheckOutline.svelte';
  import CloseOutline from 'flowbite-svelte-icons/CloseOutline.svelte';
  import InfoCircleSolid from 'flowbite-svelte-icons/InfoCircleSolid.svelte';
  import {
    compatibilityCriteria,
    IIIF_VINKJES_URL,
    SCHEMA_AP_NDE_PROFILE,
    type CompatibilityCriterion,
    type IiifManifests,
    type SchemaApNdeConformance,
  } from '$lib/services/nde-compatibility';

  let {
    isAnalyzed,
    iiifManifests,
    schemaApNde,
  }: {
    isAnalyzed: boolean;
    iiifManifests: IiifManifests;
    schemaApNde: SchemaApNdeConformance;
  } = $props();

  const criteria = $derived(
    compatibilityCriteria({ schemaApNde, iiif: iiifManifests }),
  );

  // The heading states the actual situation: a dataset legitimately may have no
  // media (unmet, neutral), may provide working media (met), or may declare media
  // that could not be loaded (failed).
  function heading(criterion: CompatibilityCriterion): string {
    switch (criterion.key) {
      case 'schema-ap-nde':
        switch (criterion.state) {
          case 'met':
            return m.nde_compat_schema_ap_nde_heading_conforms();
          case 'failed':
            return m.nde_compat_schema_ap_nde_heading_not_conforms();
          case 'unmet':
            return m.nde_compat_schema_ap_nde_heading_not_applicable();
        }
      // eslint-disable-next-line no-fallthrough
      case 'iiif':
        switch (criterion.state) {
          case 'met':
            return m.nde_compat_iiif_heading_provided();
          case 'failed':
            return m.nde_compat_iiif_heading_unavailable();
          case 'unmet':
            return m.nde_compat_iiif_heading_not_provided();
        }
    }
  }

  function explanation(criterion: CompatibilityCriterion): string {
    switch (criterion.key) {
      case 'schema-ap-nde':
        switch (criterion.state) {
          case 'met':
            return m.nde_compat_schema_ap_nde_explanation_conforms();
          case 'failed':
            return criterion.reason === 'declared-but-empty'
              ? m.nde_compat_schema_ap_nde_explanation_declared_but_empty()
              : m.nde_compat_schema_ap_nde_explanation_violations();
          case 'unmet':
            return m.nde_compat_schema_ap_nde_explanation_not_applicable();
        }
      // eslint-disable-next-line no-fallthrough
      case 'iiif':
        return m.nde_compat_iiif_explanation();
    }
  }

  // The count line is omitted when the criterion is unmet; the empty checkbox
  // already signals absence. When media is declared but broken it reports the
  // declared count and the validation failure.
  function detail(criterion: CompatibilityCriterion): string | null {
    // Pass the raw count for plural selection and a locale-formatted string for
    // display, matching the grouped numbers in the Linked Data Summary.
    const count = criterion.count;
    const display = count.toLocaleString(getLocale());
    switch (criterion.key) {
      case 'schema-ap-nde':
        // No raw counts for the profile criterion in this version.
        return null;
      case 'iiif':
        switch (criterion.state) {
          case 'met':
            return m.nde_compat_iiif_count({ count, display });
          case 'failed':
            return m.nde_compat_iiif_count_failed({ count, display });
          case 'unmet':
            return null;
        }
    }
  }

  function learnMoreHref(criterion: CompatibilityCriterion): string {
    switch (criterion.key) {
      case 'schema-ap-nde':
        return SCHEMA_AP_NDE_PROFILE;
      case 'iiif':
        return IIIF_VINKJES_URL;
    }
  }
</script>

<!-- The criteria are assessed from the dataset’s analysis in the Knowledge
     Graph, so the section is shown only for a dataset that has been analyzed. -->
{#if isAnalyzed}
  <section class="mb-8" aria-labelledby="nde-compatibility-heading">
    <h2
      id="nde-compatibility-heading"
      class="mb-4 flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-white"
    >
      {m.nde_compatibility()}
      <span id="tooltip-nde-compatibility" class="cursor-pointer">
        <InfoCircleSolid
          class="h-5 w-5 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
        />
      </span>
      <Tooltip triggeredBy="#tooltip-nde-compatibility"
        >{m.nde_compatibility_description()}</Tooltip
      >
    </h2>
    <div
      class="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
    >
      <ul class="divide-y divide-gray-200 dark:divide-gray-700">
        {#each criteria as criterion (criterion.key)}
          <li class="flex items-start gap-3 px-4 py-3">
            <!-- Status box. Green tick = met, red cross = declared but broken,
               neutral empty = not provided (a legitimate, non-failure state).
               The heading carries the status for assistive technology, so the
               box is decorative. -->
            <span
              class={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border ${
                criterion.state === 'met'
                  ? 'border-green-600 bg-green-600 text-white dark:border-green-500 dark:bg-green-500'
                  : criterion.state === 'failed'
                    ? 'border-red-600 bg-red-600 text-white dark:border-red-500 dark:bg-red-500'
                    : 'border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-700'
              }`}
              aria-hidden="true"
            >
              {#if criterion.state === 'met'}
                <CheckOutline class="h-3.5 w-3.5" />
              {:else if criterion.state === 'failed'}
                <CloseOutline class="h-3.5 w-3.5" />
              {/if}
            </span>
            <div class="min-w-0">
              <h3 class="text-base font-medium text-gray-900 dark:text-white">
                {heading(criterion)}
              </h3>
              <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
                {explanation(criterion)}
                <a
                  href={learnMoreHref(criterion)}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-blue-600 hover:underline dark:text-blue-400"
                >
                  {m.nde_compat_learn_more()}
                  <span class="sr-only"> ({m.opens_in_new_tab()})</span>
                </a>
              </p>
              {#if detail(criterion)}
                <p
                  class="mt-1 text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  {detail(criterion)}
                </p>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    </div>
  </section>
{/if}
