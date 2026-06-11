<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { getLocale } from '$lib/paraglide/runtime';
  import CheckOutline from 'flowbite-svelte-icons/CheckOutline.svelte';
  import CloseOutline from 'flowbite-svelte-icons/CloseOutline.svelte';
  import ExclamationCircleOutline from 'flowbite-svelte-icons/ExclamationCircleOutline.svelte';
  import {
    compatibilityCriteria,
    NDE_VINKJES_URL,
    NETWORK_OF_TERMS_URL,
    type CompatibilityCriterion,
    type IiifManifests,
    type LinkedData,
    type PersistentUris,
    type RegistrationFailureReason,
    type TermLinks,
  } from '$lib/services/nde-compatibility';

  let {
    isAnalyzed,
    registrationStatus,
    registrationHasWarnings,
    persistentUris,
    terms,
    iiifManifests,
    linkedData,
  }: {
    isAnalyzed: boolean;
    registrationStatus: RegistrationFailureReason | null;
    registrationHasWarnings: boolean;
    persistentUris: PersistentUris;
    terms: TermLinks | null;
    iiifManifests: IiifManifests;
    linkedData: LinkedData;
  } = $props();

  const criteria = $derived(
    compatibilityCriteria({
      isAnalyzed,
      registration: registrationStatus,
      registrationHasWarnings,
      persistent: persistentUris,
      linkedData,
      terms,
      iiif: iiifManifests,
    }),
  );

  // The heading states the actual situation: a dataset legitimately may have no
  // media (unmet, neutral), may provide working media (met), or may declare media
  // that could not be loaded (failed).
  function heading(criterion: CompatibilityCriterion): string {
    switch (criterion.key) {
      case 'registration':
        if (criterion.state === 'warning') {
          return m.nde_compat_registration_heading_warning();
        }
        switch (criterion.reason) {
          case 'gone':
            return m.nde_compat_registration_heading_gone();
          case 'invalid':
            return m.nde_compat_registration_heading_invalid();
          default:
            return m.nde_compat_registration_heading_registered();
        }
      case 'persistent':
        switch (criterion.state) {
          case 'met':
            return m.nde_compat_persistent_heading_persistent();
          case 'warning':
            return m.nde_compat_persistent_heading_resolves();
          case 'failed':
            return m.nde_compat_persistent_heading_unresolved();
          // Neutral: analyzed, but resolution has not been measured yet.
          default:
            return m.nde_compat_persistent_heading_pending();
        }
      case 'linked-data':
        switch (criterion.state) {
          case 'met':
            return m.nde_compat_linked_data_heading_conforms();
          case 'warning':
            return m.nde_compat_linked_data_heading_not_conforms();
          case 'unmet':
            return m.nde_compat_linked_data_heading_pending();
          case 'failed':
            return criterion.reason === 'empty'
              ? m.nde_compat_linked_data_heading_empty()
              : m.nde_compat_linked_data_heading_none();
        }
      // The terms criterion is binary: met (green) or failed (red).
      // eslint-disable-next-line no-fallthrough
      case 'terms':
        return criterion.state === 'met'
          ? m.nde_compat_terms_heading_uses()
          : m.nde_compat_terms_heading_not_uses();
      case 'iiif':
        switch (criterion.state) {
          case 'met':
            return m.nde_compat_iiif_heading_provided();
          case 'failed':
            return m.nde_compat_iiif_heading_unavailable();
          // IIIF has no warning tier; unmet means no media.
          default:
            return m.nde_compat_iiif_heading_not_provided();
        }
    }
  }

  function explanation(criterion: CompatibilityCriterion): string {
    switch (criterion.key) {
      case 'registration':
        if (criterion.state === 'warning') {
          return m.nde_compat_registration_explanation_warning();
        }
        switch (criterion.reason) {
          case 'gone':
            return m.nde_compat_registration_explanation_gone();
          case 'invalid':
            return m.nde_compat_registration_explanation_invalid();
          default:
            return m.nde_compat_registration_explanation_registered();
        }
      case 'persistent':
        switch (criterion.state) {
          case 'met':
            return m.nde_compat_persistent_explanation_persistent();
          case 'warning':
            return m.nde_compat_persistent_explanation_resolves();
          case 'failed':
            return m.nde_compat_persistent_explanation_unresolved();
          default:
            return m.nde_compat_persistent_explanation_pending();
        }
      case 'linked-data':
        switch (criterion.state) {
          case 'met':
            return m.nde_compat_linked_data_explanation_conforms();
          case 'warning':
            return m.nde_compat_linked_data_explanation_not_conforms();
          case 'unmet':
            return m.nde_compat_linked_data_explanation_pending();
          case 'failed':
            return criterion.reason === 'empty'
              ? m.nde_compat_linked_data_explanation_empty()
              : m.nde_compat_linked_data_explanation_none();
        }
      // A single explanation regardless of state, following the IIIF pattern.
      // The template renders this with “Network of Terms” as an inline link;
      // the two halves are joined here as the plain-text fallback.
      // eslint-disable-next-line no-fallthrough
      case 'terms':
        return (
          m.nde_compat_terms_explanation_before() +
          m.network_of_terms() +
          m.nde_compat_terms_explanation_after()
        );
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
      case 'registration':
        // Warnings are tracked at registration granularity, so the row shows
        // only the warning state and a link to the registration’s details
        // (rendered separately); it carries no count line.
        return null;
      case 'persistent':
        // When some sampled URIs failed to resolve, report the ratio as
        // evidence; when persistent and issued by a known organisation (ARK),
        // name it. Other states carry no count line.
        switch (criterion.state) {
          case 'failed': {
            const sampled = persistentUris.sampled ?? 0;
            // Report the failures directly, matching the red state: how many of
            // the sampled URIs did not resolve. Plurals key on this count.
            const unresolved = sampled - (persistentUris.resolved ?? 0);
            return m.nde_compat_persistent_count_unresolved({
              count: unresolved,
              unresolved: unresolved.toLocaleString(getLocale()),
              display: sampled.toLocaleString(getLocale()),
            });
          }
          case 'met':
            return persistentUris.publisher
              ? m.nde_compat_persistent_issued_by({
                  publisher: persistentUris.publisher,
                })
              : null;
          default:
            return null;
        }
      case 'linked-data':
        // The fact count (void:triples) is shown only when the dataset actually
        // has linked data with a known triple count.
        return (criterion.state === 'met' || criterion.state === 'warning') &&
          count > 0
          ? m.nde_compat_linked_data_count({ count, display })
          : null;
      case 'terms':
        // The count line reports how many links to terms were found; it is
        // shown only when met and links down to the Terminology Sources section
        // (see sectionAnchor).
        return criterion.state === 'met'
          ? m.nde_compat_terms_count({ count, display })
          : null;
      case 'iiif':
        switch (criterion.state) {
          case 'met':
            return m.nde_compat_iiif_count({ count, display });
          case 'failed':
            return m.nde_compat_iiif_count_failed({ count, display });
          // IIIF has no warning tier; unmet carries no count.
          default:
            return null;
        }
    }
  }

  // In-page anchor to the criterion’s evidence section further down the page, or
  // null when it has none. Registration points to its Registration section; the
  // linked-data criterion (when it reports a fact count) to the Linked Data
  // Summary section; the terms criterion (when met) to the Terminology Sources
  // section. The template attaches this to the count line when there is one,
  // otherwise renders a dedicated link.
  function sectionAnchor(criterion: CompatibilityCriterion): string | null {
    switch (criterion.key) {
      case 'registration':
        return '#registration';
      case 'linked-data':
        // Link the fact count down to the Linked Data Summary section; gated to
        // match the count line in detail() so the anchor only appears alongside
        // it, never as a standalone link.
        return (criterion.state === 'met' || criterion.state === 'warning') &&
          criterion.count > 0
          ? '#linked-data-summary'
          : null;
      case 'terms':
        return criterion.state === 'met' ? '#terminology-sources' : null;
      default:
        return null;
    }
  }
</script>

<!-- Analysis-dependent criteria are dropped for a dataset that has not been
     analyzed; the section is shown whenever any criterion remains. -->
{#if criteria.length > 0}
  <section class="mb-8" aria-labelledby="nde-compatibility-heading">
    <h2
      id="nde-compatibility-heading"
      class="mb-2 text-xl font-semibold text-gray-900 dark:text-white"
    >
      {m.nde_compatibility()}
    </h2>
    <p class="mb-4 text-sm text-gray-600 dark:text-gray-400">
      {m.nde_compatibility_description()}
      <a
        href={NDE_VINKJES_URL}
        target="_blank"
        rel="noopener noreferrer"
        class="text-blue-600 hover:underline dark:text-blue-400"
      >
        {m.nde_compat_learn_more()}
        <span class="sr-only"> ({m.opens_in_new_tab()})</span>
      </a>
    </p>
    <div
      class="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
    >
      <ul class="divide-y divide-gray-200 dark:divide-gray-700">
        {#each criteria as criterion (criterion.key)}
          {@const detailText = detail(criterion)}
          {@const sectionHref = sectionAnchor(criterion)}
          <li class="flex items-start gap-3 px-4 py-3">
            <!-- Status box. Green tick = met, orange exclamation = warning, red
               cross = error, neutral empty = pending or not applicable. The
               heading carries the status for assistive technology, so the box is
               decorative. -->
            <span
              class={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border ${
                criterion.state === 'met'
                  ? 'border-green-600 bg-green-600 text-white dark:border-green-500 dark:bg-green-500'
                  : criterion.state === 'warning'
                    ? 'border-orange-500 bg-orange-500 text-white dark:border-orange-400 dark:bg-orange-400'
                    : criterion.state === 'failed'
                      ? 'border-red-600 bg-red-600 text-white dark:border-red-500 dark:bg-red-500'
                      : 'border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-700'
              }`}
              aria-hidden="true"
            >
              {#if criterion.state === 'met'}
                <CheckOutline class="h-3.5 w-3.5" />
              {:else if criterion.state === 'warning'}
                <ExclamationCircleOutline class="h-3.5 w-3.5" />
              {:else if criterion.state === 'failed'}
                <CloseOutline class="h-3.5 w-3.5" />
              {/if}
            </span>
            <div class="min-w-0">
              <h3 class="text-base font-medium text-gray-900 dark:text-white">
                {heading(criterion)}
              </h3>
              <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
                <!-- The terms explanation links “Network of Terms” to the
                     Termennetwerk browser in the current locale; other criteria
                     render their explanation as plain text. -->
                {#if criterion.key === 'terms'}{m.nde_compat_terms_explanation_before()}<a
                    href={`${NETWORK_OF_TERMS_URL}/${getLocale()}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-blue-600 hover:underline dark:text-blue-400"
                    >{m.network_of_terms()}<span class="sr-only">
                      ({m.opens_in_new_tab()})</span
                    ></a
                  >{m.nde_compat_terms_explanation_after()}{:else}{explanation(
                    criterion,
                  )}{/if}
                <!-- A criterion with an evidence section but no count line (e.g.
                     registration) gets a dedicated in-page link here; one with a
                     count line carries the link on that line instead. -->
                {#if sectionHref && !detailText}
                  <a
                    href={sectionHref}
                    class="text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {m.nde_compat_registration_view_details()}
                  </a>
                {/if}
              </p>
              {#if detailText}
                <p
                  class="mt-1 text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  {#if sectionHref}
                    <a
                      href={sectionHref}
                      class="text-blue-600 hover:underline dark:text-blue-400"
                    >
                      {detailText}
                    </a>
                  {:else}
                    {detailText}
                  {/if}
                </p>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    </div>
  </section>
{/if}
