<script lang="ts">
  import { TabItem, Tabs } from 'flowbite-svelte';
  import * as m from '$lib/paraglide/messages';
  import UrlValidationForm from '$lib/components/validation/UrlValidationForm.svelte';
  import InlineValidationForm from '$lib/components/validation/InlineValidationForm.svelte';
  import ValidationSummary from '$lib/components/validation/ValidationSummary.svelte';
  import ValidationReport from '$lib/components/validation/ValidationReport.svelte';
  import type {
    InlineValidationOutcome,
    UrlValidationOutcome,
  } from '$lib/services/validation.js';
  import type { ContentType } from '$lib/components/validation/detect-content-type.js';
  import { getLocale } from '$lib/paraglide/runtime';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import type { PageData } from './$types';

  const { data }: { data: PageData } = $props();

  type ApiErrorDetails = import('$lib/services/validation.js').ApiErrorDetails;
  type SummaryState =
    | { kind: 'empty' }
    | { kind: 'running' }
    | {
        kind: 'report';
        report: import('$lib/services/shacl-report.js').ShaclReport;
      }
    | { kind: 'parse-error'; message: string }
    | { kind: 'not-found'; details?: ApiErrorDetails }
    | { kind: 'no-dataset'; details?: ApiErrorDetails }
    | { kind: 'error'; message: string };

  let summaryState = $state<SummaryState>({ kind: 'empty' });
  let inlineSourceText = $state<string | undefined>(undefined);
  let inlineSourceContentType = $state<ContentType | undefined>(undefined);
  let urlSource = $state<{ text: string; contentType: ContentType } | null>(
    null,
  );
  let validatedUrl = $state<string | undefined>(undefined);
  let validatedUrlAllowed = $state<boolean | undefined>(undefined);
  let inlineGoToLine = $state<((line: number) => void) | undefined>(undefined);
  let urlGoToLine = $state<((line: number) => void) | undefined>(undefined);
  let warningsOpen = $state(false);
  let infosOpen = $state(false);

  const activeSourceText = $derived(inlineSourceText ?? urlSource?.text);
  const activeSourceContentType = $derived(
    inlineSourceContentType ?? urlSource?.contentType,
  );
  const activeGoToLine = $derived(
    inlineSourceText ? inlineGoToLine : urlGoToLine,
  );

  function expandSection(section: 'warnings' | 'infos') {
    if (section === 'warnings') warningsOpen = true;
    else infosOpen = true;
    // Scroll the accordion into view after Svelte flushes the change.
    requestAnimationFrame(() => {
      const target = document.querySelector(
        section === 'warnings'
          ? '[data-validation-section=warnings]'
          : '[data-validation-section=infos]',
      );
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  const submitHref = $derived.by(() => {
    if (validatedUrlAllowed !== true) return undefined;
    const locale = getLocale();
    const base = `https://datasetregister.netwerkdigitaalerfgoed.nl/viaurl.php?lang=${locale}`;
    return validatedUrl
      ? `${base}&url=${encodeURIComponent(validatedUrl)}`
      : base;
  });

  function handleStart() {
    summaryState = { kind: 'running' };
  }

  function resetValidation() {
    summaryState = { kind: 'empty' };
    warningsOpen = false;
    infosOpen = false;
  }

  function handleUrlOutcome(
    outcome: UrlValidationOutcome | null,
    url?: string,
    allowed?: boolean,
  ): void {
    inlineSourceText = undefined;
    inlineSourceContentType = undefined;
    validatedUrl = url;
    validatedUrlAllowed = allowed;
    if (url) {
      const params = new URLSearchParams(page.url.search);
      const currentHash =
        typeof window !== 'undefined' ? window.location.hash : '';
      if (params.get('url') !== url || currentHash) {
        params.set('url', url);
        void goto(`?${params.toString()}`, {
          replaceState: true,
          keepFocus: true,
          noScroll: true,
        });
      }
    }
    if (!outcome) {
      summaryState = { kind: 'empty' };
      return;
    }
    if (outcome.kind === 'report') {
      summaryState = { kind: 'report', report: outcome.report };
    } else if (outcome.kind === 'not-found') {
      summaryState = { kind: 'not-found', details: outcome.details };
    } else if (outcome.kind === 'no-dataset') {
      summaryState = { kind: 'no-dataset', details: outcome.details };
    } else {
      summaryState = { kind: 'error', message: outcome.message };
    }
  }

  function handleInlineOutcome(
    outcome: InlineValidationOutcome | null,
    text: string,
    contentType: ContentType,
  ): void {
    inlineSourceText = text;
    inlineSourceContentType = contentType;
    urlSource = null;
    validatedUrl = undefined;
    validatedUrlAllowed = undefined;
    if (!outcome) {
      summaryState = { kind: 'empty' };
      return;
    }
    if (outcome.kind === 'report') {
      summaryState = { kind: 'report', report: outcome.report };
    } else if (outcome.kind === 'parse-error') {
      summaryState = { kind: 'parse-error', message: outcome.message };
    } else if (outcome.kind === 'no-dataset') {
      summaryState = { kind: 'no-dataset', details: outcome.details };
    } else {
      summaryState = { kind: 'error', message: outcome.message };
    }
  }

  function handleJump(line: number) {
    activeGoToLine?.(line);
  }

  const hasInlineHash =
    typeof window !== 'undefined' && /(?:^|&)rdf=/.test(window.location.hash);
  const urlTabOpen = $derived(data.tab !== 'inline' && !hasInlineHash);
  const inlineTabOpen = $derived(data.tab === 'inline' || hasInlineHash);

  const activeTab =
    'inline-block rounded-t-lg border-b-2 border-blue-700 p-4 text-blue-700 dark:border-blue-400 dark:text-blue-400 cursor-pointer';
  const inactiveTab =
    'inline-block rounded-t-lg border-b-2 border-transparent p-4 text-gray-700 hover:border-gray-300 hover:text-gray-900 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:text-gray-100 cursor-pointer';
</script>

<svelte:head>
  <title>{m.validate_page_title()}</title>
</svelte:head>

<div class="mx-auto max-w-7xl space-y-6 px-1 sm:px-6 lg:px-8">
  <div class="space-y-6">
    <header class="mb-2">
      <h1
        class="mb-4 text-3xl font-bold leading-[1.2] tracking-[-0.02em] text-gray-900 dark:text-white lg:text-4xl"
      >
        {m.validate_page_title()}
      </h1>
      <p
        class="text-lg leading-relaxed text-gray-700 dark:text-gray-300 lg:text-xl"
      >
        {m.validate_page_intro_before()}<a
          href="https://netwerk-digitaal-erfgoed.github.io/requirements-datasets/"
          target="_blank"
          rel="noopener noreferrer"
          class="text-blue-700 underline hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:text-blue-400"
          >{m.validate_requirements_link()}<span class="sr-only">
            ({m.opens_in_new_tab()})</span
          ></a
        >{m.validate_page_intro_after()}
      </p>
    </header>

    <Tabs tabStyle="underline" divider>
      <TabItem
        open={urlTabOpen}
        title={m.validate_tab_url()}
        activeClass={activeTab}
        inactiveClass={inactiveTab}
        onclick={resetValidation}
      >
        <div class="pt-4">
          <UrlValidationForm
            initialUrl={data.prefillUrl}
            autoSubmit={Boolean(data.prefillUrl)}
            onOutcome={handleUrlOutcome}
            onStart={handleStart}
            bind:goToLine={urlGoToLine}
            bind:source={urlSource}
          />
        </div>
      </TabItem>
      <TabItem
        open={inlineTabOpen}
        title={m.validate_tab_inline()}
        activeClass={activeTab}
        inactiveClass={inactiveTab}
        onclick={resetValidation}
      >
        <div class="pt-4">
          <InlineValidationForm
            onOutcome={handleInlineOutcome}
            onStart={handleStart}
            bind:goToLine={inlineGoToLine}
          />
        </div>
      </TabItem>
    </Tabs>

    {#if summaryState.kind !== 'empty'}
      <ValidationSummary
        state={summaryState}
        {submitHref}
        onExpand={expandSection}
      />
    {/if}

    {#if summaryState.kind === 'report'}
      <ValidationReport
        report={summaryState.report}
        sourceText={activeSourceText}
        sourceContentType={activeSourceContentType}
        onJump={activeSourceText ? handleJump : undefined}
        bind:warningsOpen
        bind:infosOpen
      />
    {/if}
  </div>
</div>
