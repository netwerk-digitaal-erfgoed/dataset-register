<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { slide } from 'svelte/transition';
  import { Input, Label } from 'flowbite-svelte';
  import ChevronDownOutline from 'flowbite-svelte-icons/ChevronDownOutline.svelte';
  import * as m from '$lib/paraglide/messages';
  import {
    checkDomainAllowed,
    validateByUrl,
    type UrlValidationOutcome,
  } from '$lib/services/validation.js';
  import CodeEditor from './CodeEditor.svelte';
  import {
    detectContentType,
    languageForContentType,
    type ContentType,
  } from './detect-content-type.js';
  import { formatRdf } from './format-rdf.js';

  interface Props {
    initialUrl?: string;
    autoSubmit?: boolean;
    onOutcome: (
      outcome: UrlValidationOutcome | null,
      url?: string,
      allowed?: boolean,
    ) => void;
    onStart: () => void;
    goToLine?: (line: number) => void;
    source?: { text: string; contentType: ContentType } | null;
  }

  let {
    initialUrl = '',
    autoSubmit = false,
    onOutcome,
    onStart,
    goToLine = $bindable(),
    source = $bindable(null),
  }: Props = $props();

  let url = $state('');
  let submitting = $state(false);
  let domainAllowed = $state<boolean | 'unknown'>('unknown');
  let submitController: AbortController | null = null;
  let checkController: AbortController | null = null;
  let checkTimer: ReturnType<typeof setTimeout> | undefined;
  let hasSubmitted = $state(false);
  let sourceOpen = $state(false);
  let hideFetched = $state(false);

  onDestroy(() => {
    submitController?.abort();
    checkController?.abort();
    fetchController?.abort();
    clearTimeout(checkTimer);
  });

  let fetchedText = $state<string | null>(null);
  let fetchedLanguage = $state<'json' | 'xml' | 'turtle' | 'plain'>('plain');
  let fetchedContentType = $state<ContentType | null>(null);
  let fetchController: AbortController | null = null;
  let innerGoToLine = $state<((line: number) => void) | undefined>(undefined);

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

  $effect(() => {
    const current = url;
    clearTimeout(checkTimer);
    checkController?.abort();
    const parsed = parseUrl(current);
    if (!parsed) {
      domainAllowed = 'unknown';
      return;
    }
    checkTimer = setTimeout(() => {
      const controller = new AbortController();
      checkController = controller;
      checkDomainAllowed(current, controller.signal)
        .then((ok) => {
          if (!controller.signal.aborted) domainAllowed = ok;
        })
        .catch(() => {
          if (!controller.signal.aborted) domainAllowed = 'unknown';
        });
    }, 400);
  });

  async function dereference(targetUrl: string) {
    fetchController?.abort();
    const controller = new AbortController();
    fetchController = controller;
    fetchedText = null;
    fetchedContentType = null;
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
      } else {
        fetchedText = body;
      }
    } catch {
      // Proxy failures are non-fatal — the main validation can still succeed.
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
    hasSubmitted = true;
    hideFetched = false;
    onStart();
    // Fire dereference in parallel so the user can inspect the raw body
    // while the SHACL validation runs.
    void dereference(url);
    const submittedUrl = url;
    const allowedNow =
      domainAllowed === true
        ? true
        : domainAllowed === false
          ? false
          : undefined;
    try {
      const outcome = await validateByUrl(submittedUrl, controller.signal);
      if (!controller.signal.aborted) {
        hideFetched = outcome.kind === 'no-dataset';
        onOutcome(outcome, submittedUrl, allowedNow);
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
          allowedNow,
        );
      }
    } finally {
      if (!controller.signal.aborted) submitting = false;
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
      class="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:bg-blue-400 disabled:cursor-not-allowed dark:bg-blue-600 dark:hover:bg-blue-700 dark:disabled:bg-blue-900 dark:disabled:text-blue-300 cursor-pointer"
    >
      {#if submitting}
        <span
          class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/50 border-t-white"
          aria-hidden="true"
        ></span>
        {m.validate_running()}
      {:else}
        {m.validate_url_submit()}
      {/if}
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
        <span>{m.validate_url_source_title()}</span>
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
        <div class="overflow-hidden">
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
        </div>
      </div>
    </div>
  {/if}
</form>
