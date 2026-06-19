<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { getLocale } from '$lib/paraglide/runtime';
  import { Tooltip } from 'flowbite-svelte';
  import ArrowUpRightFromSquareOutline from 'flowbite-svelte-icons/ArrowUpRightFromSquareOutline.svelte';
  import CheckOutline from 'flowbite-svelte-icons/CheckOutline.svelte';
  import ChevronRightOutline from 'flowbite-svelte-icons/ChevronRightOutline.svelte';
  import CloseOutline from 'flowbite-svelte-icons/CloseOutline.svelte';
  import ExclamationCircleOutline from 'flowbite-svelte-icons/ExclamationCircleOutline.svelte';
  import InfoCircleSolid from 'flowbite-svelte-icons/InfoCircleSolid.svelte';
  import {
    compatibilityCriteria,
    IIIF_URL,
    NDE_VINKJES_URL,
    NETWORK_OF_TERMS_URL,
    type CompatibilityCriterion,
    type CompatibilityFailureReason,
    type CompatibilityState,
    type IiifManifests,
    type LinkedData,
    type PersistentUriFailureReason,
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
    validateHref,
  }: {
    isAnalyzed: boolean;
    registrationStatus: RegistrationFailureReason | null;
    registrationHasWarnings: boolean;
    persistentUris: PersistentUris;
    terms: TermLinks | null;
    iiifManifests: IiifManifests;
    linkedData: LinkedData;
    // Localized link to this dataset’s validation page, matching the valid/invalid
    // button in the Registration section. The IIIF criterion links “IIIF” here so
    // visitors can inspect the manifest validation results. Null when the dataset
    // has no registered URL to validate.
    validateHref: string | null;
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
            // Three orange reasons: pages that resolve but do not reference their
            // PID, a sample that errored, versus a namespace that resolves but is
            // non-durable.
            switch (criterion.reason) {
              case 'no-self-reference':
                return m.nde_compat_persistent_heading_no_self_reference();
              case 'sampling-failed':
                return m.nde_compat_persistent_heading_sampling_failed();
              default:
                return m.nde_compat_persistent_heading_resolves();
            }
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
            switch (criterion.reason) {
              case 'no-self-reference':
                return m.nde_compat_persistent_explanation_no_self_reference();
              case 'sampling-failed':
                return m.nde_compat_persistent_explanation_sampling_failed();
              default:
                return m.nde_compat_persistent_explanation_resolves();
            }
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
      // Met: a positive explanation the template renders with “Network of Terms”
      // as an inline link (the two halves are joined here as the plain-text
      // fallback). Failed: a negative explanation, so the red row no longer reads
      // as if the dataset does link to terms.
      // eslint-disable-next-line no-fallthrough
      case 'terms':
        return criterion.state === 'met'
          ? m.nde_compat_terms_explanation_before() +
              m.network_of_terms() +
              m.nde_compat_terms_explanation_after()
          : m.nde_compat_terms_explanation_not_before() +
              m.network_of_terms() +
              m.nde_compat_terms_explanation_not_after();
      // Met: the benefit of providing IIIF, which the template renders with
      // “IIIF” as an inline link (the halves are joined here as the plain-text
      // fallback). Failed/unmet: state-specific text, so a row whose media is
      // unavailable or absent no longer reads as if IIIF works.
      case 'iiif':
        switch (criterion.state) {
          case 'met':
            return (
              m.nde_compat_iiif_explanation_before() +
              m.iiif() +
              m.nde_compat_iiif_explanation_after()
            );
          case 'failed':
            return m.nde_compat_iiif_explanation_unavailable();
          default:
            return m.nde_compat_iiif_explanation_not_provided();
        }
    }
  }

  // One line in a criterion’s state legend: the status tier (for the indicator’s
  // shape and colour), the heading that labels that state, and the explanation of
  // what that state means.
  type LegendEntry = {
    state: CompatibilityState;
    label: string;
    description: string;
  };

  // The states to list in a criterion’s tooltip legend. Each line reuses the same
  // heading() and explanation() strings as the rows (built from a synthetic
  // criterion), so the legend has no messages of its own to translate and
  // maintain. Criteria differ in which tiers they can take: registration and
  // linked data have two distinct red reasons; terms is binary; IIIF has no
  // warning tier. The neutral “pending” tier (persistent, linked data) is
  // transient, so it is only listed while the criterion is actually in it; IIIF’s
  // neutral tier is a real outcome (“no media”) and is always listed.
  function legendEntries(criterion: CompatibilityCriterion): LegendEntry[] {
    const entry = (
      state: CompatibilityState,
      reason?: CompatibilityFailureReason,
    ): LegendEntry => {
      const synthetic: CompatibilityCriterion = {
        key: criterion.key,
        state,
        count: 0,
        ...(reason ? { reason } : {}),
      };
      return {
        state,
        label: heading(synthetic),
        description: explanation(synthetic),
      };
    };
    switch (criterion.key) {
      case 'registration':
        return [
          entry('met'),
          entry('warning'),
          entry('failed', 'gone'),
          entry('failed', 'invalid'),
        ];
      case 'persistent':
        return [
          entry('met'),
          entry('warning', 'non-durable'),
          entry('warning', 'no-self-reference'),
          // Errored sampling is a transient condition, so list it only while the
          // criterion is actually in it, like the neutral pending tier below.
          ...(criterion.reason === 'sampling-failed'
            ? [entry('warning', 'sampling-failed')]
            : []),
          entry('failed', 'unresolved'),
          ...(criterion.state === 'unmet' ? [entry('unmet')] : []),
        ];
      case 'linked-data':
        return [
          entry('met'),
          entry('warning'),
          entry('failed', 'no-linked-data'),
          entry('failed', 'empty'),
          ...(criterion.state === 'unmet' ? [entry('unmet')] : []),
        ];
      case 'terms':
        return [entry('met'), entry('failed')];
      case 'iiif':
        return [entry('met'), entry('failed'), entry('unmet')];
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
          case 'warning': {
            // The non-durable warning carries no count line; the no-self-reference
            // warning reports how many sampled pages resolve but do not reference
            // their PID, mirroring the failing-URI list below.
            if (criterion.reason !== 'no-self-reference') {
              return null;
            }
            const sampled = persistentUris.sampled ?? 0;
            const unreferenced = persistentUris.failures.length;
            return m.nde_compat_persistent_count_no_self_reference({
              count: unreferenced,
              unreferenced: unreferenced.toLocaleString(getLocale()),
              display: sampled.toLocaleString(getLocale()),
            });
          }
          case 'met': {
            // Surface the recognised PID scheme (ARK/Handle) as a bonus, and
            // name the issuing organisation when known (ARK only). The scheme
            // enum maps to its proper-name label, identical in both locales.
            const schemeLabel =
              persistentUris.scheme === 'ark'
                ? 'ARK'
                : persistentUris.scheme === 'handle'
                  ? 'Handle'
                  : null;
            if (schemeLabel && persistentUris.publisher) {
              return m.nde_compat_persistent_scheme_issued_by({
                scheme: schemeLabel,
                publisher: persistentUris.publisher,
              });
            }
            if (schemeLabel) {
              return m.nde_compat_persistent_uses_scheme({
                scheme: schemeLabel,
              });
            }
            return persistentUris.publisher
              ? m.nde_compat_persistent_issued_by({
                  publisher: persistentUris.publisher,
                })
              : null;
          }
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

  // The provider-facing label for a single failing URI’s reason, listed beside
  // the URI so the cause is conveyed as text (not by colour alone).
  function failureReasonLabel(reason: PersistentUriFailureReason): string {
    switch (reason) {
      case 'no-self-reference':
        return m.nde_compat_persistent_reason_no_self_reference();
      case 'http-error':
        return m.nde_compat_persistent_reason_http_error();
      case 'timeout':
        return m.nde_compat_persistent_reason_timeout();
      case 'network-error':
        return m.nde_compat_persistent_reason_network_error();
      case 'wrong-content-type':
        return m.nde_compat_persistent_reason_wrong_content_type();
    }
  }

  // Link to the criterion’s evidence, or null when it has none. Registration
  // points to this dataset’s validation page (the same link as the valid/invalid
  // button in the Registration section); the linked-data criterion (when it
  // reports a fact count) to the in-page Linked Data Summary section; the terms
  // criterion (when met) to the in-page Terminology Sources section. The template
  // attaches this to the count line when there is one, otherwise renders a
  // dedicated link.
  function sectionAnchor(criterion: CompatibilityCriterion): string | null {
    switch (criterion.key) {
      case 'registration':
        return validateHref;
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

<!-- Mini status indicator for the per-criterion state legend, mirroring each
     row's status box: the shape (tick / exclamation / cross / empty box) carries
     the meaning alongside the colour, so the legend stays legible for colourblind
     users and on the dark tooltip background. Decorative — the adjacent text
     names the state. -->
{#snippet statusIndicator(state: CompatibilityState)}
  <span
    class={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${
      state === 'met'
        ? 'border-green-600 bg-green-600 text-white dark:border-green-500 dark:bg-green-500'
        : state === 'warning'
          ? 'border-orange-500 bg-orange-500 text-white dark:border-orange-400 dark:bg-orange-400'
          : state === 'failed'
            ? 'border-red-600 bg-red-600 text-white dark:border-red-500 dark:bg-red-500'
            : 'border-gray-300 bg-white dark:border-gray-400 dark:bg-gray-700'
    }`}
    aria-hidden="true"
  >
    {#if state === 'met'}<CheckOutline
        class="h-3 w-3"
      />{:else if state === 'warning'}<ExclamationCircleOutline
        class="h-3 w-3"
      />{:else if state === 'failed'}<CloseOutline class="h-3 w-3" />{/if}
  </span>
{/snippet}

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
        {m.nde_compat_learn_more()}<ArrowUpRightFromSquareOutline
          class="ms-1 inline-block h-3 w-3 align-[-0.1em]"
          aria-hidden="true"
        /><span class="sr-only"> ({m.opens_in_new_tab()})</span>
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
                {heading(criterion)}<span
                  id={`tooltip-${criterion.key}-states`}
                  class="ms-1 inline-flex cursor-pointer align-[-0.125em]"
                  ><InfoCircleSolid
                    class="h-4 w-4 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
                  /><span class="sr-only"
                    >{m.nde_compat_state_legend_label()}</span
                  ></span
                >
              </h3>
              <!-- A per-criterion legend of the states this criterion can take, so
                   visitors can see what each status means here (and what reaching
                   green requires). Each line reuses the row’s own heading and
                   explanation for that state (see legendEntries), so there is a
                   single source of truth. -->
              <Tooltip
                triggeredBy={`#tooltip-${criterion.key}-states`}
                class="max-w-xs text-left"
              >
                <ul class="space-y-1.5">
                  {#each legendEntries(criterion) as item (item.label)}
                    <li class="flex items-start gap-2">
                      {@render statusIndicator(item.state)}
                      <span
                        ><span class="font-medium">{item.label}</span>: {item.description}</span
                      >
                    </li>
                  {/each}
                </ul>
              </Tooltip>
              <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
                <!-- The terms explanation links “Network of Terms” to the
                     Termennetwerk browser in the current locale — in both the
                     met and failed states, with state-specific wording around
                     the link — and the IIIF explanation links “IIIF” to NDE’s
                     IIIF page. Both are external (new tab + icon). Other criteria
                     render their explanation as plain text. -->
                {#if criterion.key === 'terms'}{criterion.state === 'met'
                    ? m.nde_compat_terms_explanation_before()
                    : m.nde_compat_terms_explanation_not_before()}<a
                    href={`${NETWORK_OF_TERMS_URL}/${getLocale()}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-blue-600 hover:underline dark:text-blue-400"
                    >{m.network_of_terms()}<ArrowUpRightFromSquareOutline
                      class="ms-0.5 inline-block h-3 w-3 align-[-0.1em]"
                      aria-hidden="true"
                    /><span class="sr-only"> ({m.opens_in_new_tab()})</span></a
                  >{criterion.state === 'met'
                    ? m.nde_compat_terms_explanation_after()
                    : m.nde_compat_terms_explanation_not_after()}{:else if criterion.key === 'iiif' && criterion.state === 'met'}{m.nde_compat_iiif_explanation_before()}<a
                    href={IIIF_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-blue-600 hover:underline dark:text-blue-400"
                    >{m.iiif()}<ArrowUpRightFromSquareOutline
                      class="ms-0.5 inline-block h-3 w-3 align-[-0.1em]"
                      aria-hidden="true"
                    /><span class="sr-only"> ({m.opens_in_new_tab()})</span></a
                  >{m.nde_compat_iiif_explanation_after()}{:else}{explanation(
                    criterion,
                  )}{/if}
                <!-- A criterion with an evidence link but no count line (e.g.
                     registration, linking to the validation page) gets a
                     dedicated link here; one with a count line carries the link
                     on that line instead. -->
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
                <!-- For the persistent criterion’s failing states (the red “did
                     not resolve” and orange “does not reference its PID” rows),
                     the count sentence doubles as the summary of a fold-out that
                     reveals exactly which sampled URIs failed, each with its
                     reason. This keeps the row compact until a provider wants the
                     detail. Gated on the failure reasons so the
                     independently-fetched failures only surface alongside the
                     matching figures, never under a green/neutral row. The reason
                     is text, not colour, for accessibility. -->
                {#if criterion.key === 'persistent' && (criterion.reason === 'unresolved' || criterion.reason === 'no-self-reference') && persistentUris.failures.length > 0}
                  <details class="group mt-1 text-sm">
                    <summary
                      class="flex cursor-pointer list-none items-center gap-1 font-medium text-gray-700 [&::-webkit-details-marker]:hidden dark:text-gray-300"
                    >
                      <ChevronRightOutline
                        class="h-3.5 w-3.5 flex-shrink-0 transition-transform group-open:rotate-90"
                        aria-hidden="true"
                      />
                      {detailText}
                    </summary>
                    <!-- Indent the list to line up with the summary text,
                         clearing the disclosure chevron (its width plus the
                         summary's gap), so the failures read as nested under the
                         count sentence. Each URI carries its own reason as text
                         (not colour) for accessibility. -->
                    <ul
                      class="mt-2 space-y-1 ps-[1.125rem] text-gray-600 dark:text-gray-400"
                    >
                      {#each persistentUris.failures as failure (failure.uri)}
                        <li class="flex flex-wrap items-baseline">
                          <a
                            href={failure.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="break-all text-blue-600 hover:underline dark:text-blue-400"
                            >{failure.uri}<ArrowUpRightFromSquareOutline
                              class="ms-0.5 inline-block h-3 w-3 align-[-0.1em]"
                              aria-hidden="true"
                            /><span class="sr-only">
                              ({m.opens_in_new_tab()})</span
                            ></a
                          >
                          <span class="text-gray-500 dark:text-gray-400"
                            >: {failureReasonLabel(failure.reason)}</span
                          >
                        </li>
                      {/each}
                    </ul>
                  </details>
                {:else}
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
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    </div>
  </section>
{/if}
