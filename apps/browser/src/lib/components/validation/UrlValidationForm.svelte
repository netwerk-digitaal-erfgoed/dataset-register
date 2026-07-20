<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { slide } from 'svelte/transition';
  import { Input, Label, Tooltip } from 'flowbite-svelte';
  import ChevronDownOutline from 'flowbite-svelte-icons/ChevronDownOutline.svelte';
  import ClipboardOutline from 'flowbite-svelte-icons/ClipboardOutline.svelte';
  import ClipboardCheckOutline from 'flowbite-svelte-icons/ClipboardCheckOutline.svelte';
  import * as m from '$lib/paraglide/messages';
  import {
    checkDomainAllowed,
    checkUrlRegistered,
    validateByUrl,
    type UrlValidationOutcome,
    type ValidationProgress,
  } from '$lib/services/validation.js';
  import CodeEditor from './CodeEditor.svelte';
  import {
    detectContentType,
    languageForContentType,
    type ContentType,
  } from './detect-content-type.js';
  import { formatRdf } from './format-rdf.js';
  import {
    summarizeDescription,
    type DescriptionSummary,
  } from './description-summary.js';

  interface Props {
    initialUrl?: string;
    autoSubmit?: boolean;
    onOutcome: (
      outcome: UrlValidationOutcome | null,
      url?: string,
      allowed?: boolean,
      registered?: boolean,
    ) => void;
    onStart: () => void;
    onValidatorLink?: (hash: string) => void;
    goToLine?: (line: number) => void;
    source?: { text: string; contentType: ContentType } | null;
  }

  let {
    initialUrl = '',
    autoSubmit = false,
    onOutcome,
    onStart,
    onValidatorLink,
    goToLine = $bindable(),
    source = $bindable(null),
  }: Props = $props();

  let url = $state('');
  let submitting = $state(false);
  let progress = $state<ValidationProgress | null>(null);
  let submitController: AbortController | null = null;
  let hasSubmitted = $state(false);
  let sourceOpen = $state(false);
  let hideFetched = $state(false);
  let copied = $state(false);

  async function handleCopy() {
    if (fetchedText === null) return;
    try {
      await navigator.clipboard.writeText(fetchedText);
      copied = true;
      setTimeout(() => {
        copied = false;
      }, 1500);
    } catch {
      // ignore – some browsers block clipboard without a user gesture on
      // certain origins; fallback to selection would be the next step.
    }
  }

  onDestroy(() => {
    submitController?.abort();
    fetchController?.abort();
  });

  let fetchedText = $state<string | null>(null);
  let fetchedLanguage = $state<'json' | 'xml' | 'turtle' | 'plain'>('plain');
  let fetchedContentType = $state<ContentType | null>(null);
  let descriptionSummary = $state<DescriptionSummary | null>(null);
  let fetchController: AbortController | null = null;
  let innerGoToLine = $state<((line: number) => void) | undefined>(undefined);

  // Acknowledge what was actually fetched: a single dataset description or
  // several (presented as a data catalog). Falls back to the generic title when
  // the source could not be parsed or held no datasets.
  const sourceTitle = $derived.by(() => {
    const summary = descriptionSummary;
    if (!summary || summary.datasetCount === 0) {
      return m.validate_url_source_title();
    }
    if (summary.datasetCount === 1) {
      return m.validate_url_source_title_dataset({ count: 1 });
    }
    return m.validate_url_source_title_catalog({ count: summary.datasetCount });
  });

  // Expose a wrapped goToLine: auto-open the accordion and wait for the
  // grid-template-rows transition (~200ms) so CodeMirror has measurable
  // height before we ask it to scroll.
  $effect(() => {
    const inner = innerGoToLine;
    if (!inner || fetchedText === null) {
      goToLine = undefined;
      return;
    }
    goToLine = (line: number) => {
      if (sourceOpen) {
        inner(line);
        return;
      }
      sourceOpen = true;
      setTimeout(() => inner(line), 220);
    };
  });

  $effect(() => {
    source =
      fetchedText !== null && fetchedContentType
        ? { text: fetchedText, contentType: fetchedContentType }
        : null;
  });

  $effect(() => {
    const seed = initialUrl;
    untrack(() => {
      if (seed && !url) url = seed;
    });
  });

  function parseUrl(input: string): URL | null {
    try {
      const parsed = new URL(input);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  // Detect a pasted validator self-link with an inline `#rdf=` payload and
  // hand the fragment to the parent so it can switch to the Inline tab.
  $effect(() => {
    const current = url;
    const parsed = parseUrl(current);
    if (!parsed || !/(?:^|#|&)rdf=/.test(parsed.hash)) return;
    const hashValue = parsed.hash.replace(/^#/, '');
    untrack(() => {
      url = '';
      onValidatorLink?.(hashValue);
    });
  });

  async function dereference(targetUrl: string) {
    fetchController?.abort();
    const controller = new AbortController();
    fetchController = controller;
    fetchedText = null;
    fetchedContentType = null;
    descriptionSummary = null;
    try {
      const response = await fetch(
        `/proxy/dereference?url=${encodeURIComponent(targetUrl)}`,
        { signal: controller.signal },
      );
      if (!response.ok) return;
      const body = await response.text();
      const guessed =
        detectContentType(body) ??
        (response.headers.get('content-type')?.includes('json')
          ? ('application/ld+json' as ContentType)
          : null);
      fetchedLanguage = languageForContentType(guessed);
      fetchedContentType = guessed;
      if (guessed) {
        const formatted = await formatRdf(body, guessed);
        fetchedText = formatted.kind === 'ok' ? formatted.text : body;
        const summary = await summarizeDescription(body, guessed);
        if (!controller.signal.aborted) descriptionSummary = summary;
      } else {
        fetchedText = body;
      }
    } catch {
      // Proxy failures are non-fatal – the main validation can still succeed.
    }
  }

  async function submit(event?: SubmitEvent) {
    event?.preventDefault();
    const parsed = parseUrl(url);
    if (!parsed || submitting) return;
    submitController?.abort();
    const controller = new AbortController();
    submitController = controller;
    submitting = true;
    progress = null;
    hasSubmitted = true;
    hideFetched = false;
    onStart();
    // Fire dereference in parallel so the user can inspect the raw body
    // while the SHACL validation runs.
    void dereference(url);
    const submittedUrl = url;
    // Only the outcome needs this, so ask alongside validation rather than
    // before it. A failed check reads as ‘unknown’, never as ‘not allowed’.
    const allowed = checkDomainAllowed(submittedUrl, controller.signal).catch(
      () => undefined,
    );
    // Already-registered URLs must not offer a submit action. Asked alongside
    // validation; a failed check reads as ‘unknown’, never as ‘registered’.
    const registered = checkUrlRegistered(
      submittedUrl,
      controller.signal,
    ).catch(() => undefined);
    try {
      const outcome = await validateByUrl(
        submittedUrl,
        controller.signal,
        (update) => {
          if (!controller.signal.aborted) progress = update;
        },
      );
      if (!controller.signal.aborted) {
        hideFetched = outcome.kind === 'no-dataset';
        onOutcome(outcome, submittedUrl, await allowed, await registered);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        onOutcome(
          {
            kind: 'error',
            message:
              error instanceof Error ? error.message : 'Validation failed',
          },
          submittedUrl,
          await allowed,
          await registered,
        );
      }
    } finally {
      if (!controller.signal.aborted) {
        submitting = false;
        progress = null;
      }
    }
  }

  let hasAutoSubmitted = false;
  $effect(() => {
    if (autoSubmit && initialUrl && !hasAutoSubmitted) {
      hasAutoSubmitted = true;
      void submit();
    }
  });

  const isValidUrl = $derived(parseUrl(url) !== null);

  // Single source of truth for "we have a determinate progress to show": the
  // fill, the label, and the percent all key off this one value.
  const activeProgress = $derived(
    progress !== null && progress.total > 0 ? progress : null,
  );
  const progressPercent = $derived(
    activeProgress
      ? Math.round((activeProgress.completed / activeProgress.total) * 100)
      : 0,
  );
</script>

<form class="space-y-3" onsubmit={submit}>
  <Label for="validate-url" class="block">{m.validate_url_label()}</Label>
  <div class="flex flex-col sm:flex-row gap-2">
    <Input
      id="validate-url"
      type="url"
      placeholder={m.validate_url_placeholder()}
      bind:value={url}
      class="flex-1"
      required
      autocomplete="url"
      inputmode="url"
      spellcheck={false}
    />
    <button
      type="submit"
      disabled={!isValidUrl || submitting}
      aria-busy={submitting}
      class="relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:bg-blue-400 disabled:cursor-not-allowed dark:bg-blue-600 dark:hover:bg-blue-700 dark:disabled:bg-blue-900 dark:disabled:text-blue-300 cursor-pointer"
    >
      {#if activeProgress}
        <!-- Determinate fill: a darker overlay keeps the white label well above
             the WCAG AA contrast minimum across the whole button. role +
             aria-value* expose the progress to assistive tech (the visible
             label is decorative and hidden from it to avoid double-announcing). -->
        <span
          class="absolute inset-y-0 left-0 bg-blue-900/50 transition-[width] duration-300 ease-out"
          style="width: {progressPercent}%"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={activeProgress.total}
          aria-valuenow={activeProgress.completed}
          aria-valuetext={m.validate_checking({
            completed: activeProgress.completed,
            total: activeProgress.total,
          })}
        ></span>
      {/if}
      <span
        class="relative inline-flex items-center gap-2"
        aria-hidden={!!activeProgress}
      >
        {#if submitting}
          <span
            class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/50 border-t-white"
            aria-hidden="true"
          ></span>
          {#if activeProgress}
            {m.validate_checking({
              completed: activeProgress.completed,
              total: activeProgress.total,
            })}
          {:else}
            {m.validate_running()}
          {/if}
        {:else}
          {m.validate_url_submit()}
        {/if}
      </span>
    </button>
  </div>

  {#if hasSubmitted && fetchedText !== null && !hideFetched}
    <div
      transition:slide={{ duration: 200 }}
      class="mt-2 overflow-clip rounded-lg border border-gray-200 dark:border-gray-700"
    >
      <button
        type="button"
        onclick={() => (sourceOpen = !sourceOpen)}
        aria-expanded={sourceOpen}
        class="sticky top-0 z-10 flex w-full cursor-pointer items-center justify-between gap-2 rounded-t-lg bg-gray-50 px-4 py-3 text-left text-sm font-medium text-gray-900 shadow-sm hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700"
      >
        <span>{sourceTitle}</span>
        <ChevronDownOutline
          class="h-4 w-4 shrink-0 transition-transform duration-200 {sourceOpen
            ? 'rotate-180'
            : ''}"
        />
      </button>
      <div
        class="grid transition-[grid-template-rows] duration-200 ease-out {sourceOpen
          ? 'grid-rows-[1fr]'
          : 'grid-rows-[0fr]'}"
      >
        <div class="relative overflow-hidden">
          <CodeEditor
            value={fetchedText}
            language={fetchedLanguage}
            ariaLabel={m.validate_url_source_title()}
            minHeight="16rem"
            maxHeight="60vh"
            readOnly
            flush
            bind:goToLine={innerGoToLine}
          />
          <div class="absolute top-2 right-3 z-10">
            <button
              id="url-source-copy"
              type="button"
              onclick={handleCopy}
              aria-label={copied
                ? m.validate_editor_copied()
                : m.validate_editor_copy()}
              class="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              {#if copied}
                <ClipboardCheckOutline class="w-4 h-4" />
              {:else}
                <ClipboardOutline class="w-4 h-4" />
              {/if}
            </button>
            <Tooltip triggeredBy="#url-source-copy">
              {copied ? m.validate_editor_copied() : m.validate_editor_copy()}
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  {/if}
</form>
