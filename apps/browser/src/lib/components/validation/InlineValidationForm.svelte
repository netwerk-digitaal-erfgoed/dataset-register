<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import {
    compressToEncodedURIComponent,
    decompressFromEncodedURIComponent,
  } from 'lz-string';
  import { Label, Select, Tooltip } from 'flowbite-svelte';
  import AlignLeftOutline from 'flowbite-svelte-icons/AlignLeftOutline.svelte';
  import ClipboardOutline from 'flowbite-svelte-icons/ClipboardOutline.svelte';
  import ClipboardCheckOutline from 'flowbite-svelte-icons/ClipboardCheckOutline.svelte';
  import CodeEditor from './CodeEditor.svelte';
  import * as m from '$lib/paraglide/messages';
  import {
    validateInline,
    type InlineValidationOutcome,
  } from '$lib/services/validation.js';
  import {
    CONTENT_TYPES,
    detectContentType,
    languageForContentType,
    type ContentType,
  } from './detect-content-type.js';
  import { formatRdf } from './format-rdf.js';

  interface Props {
    onOutcome: (
      outcome: InlineValidationOutcome | null,
      sourceText: string,
      contentType: ContentType,
    ) => void;
    onStart: () => void;
    goToLine?: (line: number) => void;
  }

  let {
    onOutcome,
    onStart,
    goToLine = $bindable(),
  }: Props = $props();

  const contentTypeLabels: Record<ContentType, string> = {
    'text/turtle': 'Turtle',
    'application/ld+json': 'JSON-LD',
    'application/rdf+xml': 'RDF/XML',
    'application/n-triples': 'N-Triples',
    'application/n-quads': 'N-Quads',
    'application/trig': 'TriG',
    'text/n3': 'Notation3',
  };

  let text = $state('');
  let selectedContentType = $state<ContentType>('text/turtle');
  let userOverride = $state(false);
  let validating = $state(false);
  let formatting = $state(false);
  let formatMessage = $state<string | null>(null);
  let copied = $state(false);
  let submitController: AbortController | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  onDestroy(() => {
    submitController?.abort();
    clearTimeout(debounceTimer);
    clearTimeout(hashTimer);
  });
  let innerFocus = $state<(() => void) | undefined>(undefined);

  // Hash-based deep link: on mount, seed the editor from `#rdf=<lz>` and
  // optionally `#ct=<mime>`. The fragment stays client-side so pasted RDF
  // never reaches the server or access logs.
  function readHash(): { text?: string; contentType?: ContentType } {
    if (typeof window === 'undefined') return {};
    const hash = window.location.hash.replace(/^#/, '');
    if (!hash) return {};
    const params = new URLSearchParams(hash);
    const encoded = params.get('rdf');
    const ct = params.get('ct') as ContentType | null;
    if (!encoded) return {};
    const decoded = decompressFromEncodedURIComponent(encoded);
    return decoded
      ? {
          text: decoded,
          contentType: ct && CONTENT_TYPES.includes(ct) ? ct : undefined,
        }
      : {};
  }

  onMount(() => {
    const seed = readHash();
    if (seed.text) {
      text = seed.text;
      if (seed.contentType) {
        selectedContentType = seed.contentType;
        userOverride = true;
      }
    }
  });

  // Reflect editor content into the URL fragment (debounced), so the user
  // can copy the browser URL to share the current paste.
  let hashTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const body = text;
    const contentType = selectedContentType;
    if (typeof window === 'undefined') return;
    clearTimeout(hashTimer);
    hashTimer = setTimeout(() => {
      const fragment = new URLSearchParams();
      if (body) {
        fragment.set('rdf', compressToEncodedURIComponent(body));
        if (userOverride) fragment.set('ct', contentType);
      }
      const url = new URL(window.location.href);
      url.hash = fragment.toString() ? `#${fragment}` : '';
      if (body) {
        url.searchParams.delete('url');
        url.searchParams.delete('tab');
      }
      if (url.toString() !== window.location.href) {
        history.replaceState(history.state, '', url.toString());
      }
    }, 400);
  });

  const detected = $derived(detectContentType(text));
  const language = $derived(languageForContentType(selectedContentType));

  $effect(() => {
    if (!userOverride && detected && detected !== selectedContentType) {
      selectedContentType = detected;
    }
  });

  $effect(() => {
    const body = text;
    const contentType = selectedContentType;
    clearTimeout(debounceTimer);
    submitController?.abort();
    if (!body.trim()) {
      onOutcome(null, body, contentType);
      return;
    }
    debounceTimer = setTimeout(() => {
      void runValidation(body, contentType);
    }, 700);
  });

  async function runValidation(body: string, contentType: ContentType) {
    const controller = new AbortController();
    submitController = controller;
    validating = true;
    onStart();
    try {
      const outcome = await validateInline(body, contentType, controller.signal);
      if (!controller.signal.aborted) {
        onOutcome(outcome, body, contentType);
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      onOutcome(
        {
          kind: 'error',
          message:
            error instanceof Error ? error.message : 'Validation failed',
        },
        body,
        contentType,
      );
    } finally {
      if (!controller.signal.aborted) validating = false;
    }
  }

  const selectItems = $derived(
    CONTENT_TYPES.map((type) => ({
      value: type,
      name:
        !userOverride && detected === type
          ? `${contentTypeLabels[type]} (${m.validate_inline_autodetected()})`
          : contentTypeLabels[type],
    })),
  );

  function handleSelectChange() {
    userOverride = true;
  }

  async function handleFormat() {
    if (!text.trim() || formatting) return;
    formatting = true;
    formatMessage = null;
    const outcome = await formatRdf(text, selectedContentType);
    formatting = false;
    if (outcome.kind === 'ok') {
      text = outcome.text;
    } else if (outcome.kind === 'unsupported') {
      formatMessage = m.validate_format_unsupported();
    } else {
      formatMessage = outcome.message;
    }
  }

  async function handleCopy() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      setTimeout(() => {
        copied = false;
      }, 1500);
    } catch {
      // ignore — some browsers block clipboard without a user gesture on
      // certain origins; fallback to selection would be the next step.
    }
  }

  const canFormat = $derived(
    text.trim().length > 0 &&
      (selectedContentType === 'application/ld+json' ||
        selectedContentType === 'text/turtle' ||
        selectedContentType === 'application/n-triples' ||
        selectedContentType === 'application/n-quads' ||
        selectedContentType === 'application/trig' ||
        selectedContentType === 'text/n3'),
  );

  function handleLabelClick() {
    innerFocus?.();
  }
</script>

<div class="space-y-3">
  <Label
    for="validate-inline-editor"
    class="block cursor-text"
    onclick={handleLabelClick}
  >
    {m.validate_inline_editor_label()}
  </Label>

  <div id="validate-inline-editor" class="relative">
    <CodeEditor
      bind:value={text}
      {language}
      placeholder={m.validate_inline_placeholder()}
      ariaLabel={m.validate_inline_editor_label()}
      minHeight="22rem"
      bind:focusEditor={innerFocus}
      bind:goToLine
    />

    <div class="absolute top-2 right-3 flex items-center gap-1 z-10">
      <button
        id="editor-copy"
        type="button"
        onclick={handleCopy}
        disabled={!text}
        aria-label={copied
          ? m.validate_editor_copied()
          : m.validate_editor_copy()}
        class="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {#if copied}
          <ClipboardCheckOutline class="w-4 h-4" />
        {:else}
          <ClipboardOutline class="w-4 h-4" />
        {/if}
      </button>
      <Tooltip triggeredBy="#editor-copy">
        {copied ? m.validate_editor_copied() : m.validate_editor_copy()}
      </Tooltip>

      <button
        id="editor-format"
        type="button"
        onclick={handleFormat}
        disabled={!canFormat || formatting}
        aria-label={m.validate_format_button()}
        class="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <AlignLeftOutline class="w-4 h-4" />
      </button>
      <Tooltip triggeredBy="#editor-format">
        {m.validate_format_button()}
      </Tooltip>
    </div>
  </div>

  <div>
    <label
      for="validate-content-type"
      class="block mb-1 text-sm text-gray-900 dark:text-gray-100"
    >
      {m.validate_inline_content_type()}
    </label>
    <Select
      id="validate-content-type"
      bind:value={selectedContentType}
      items={selectItems}
      onchange={handleSelectChange}
      placeholder=""
      class="w-full"
    />
  </div>

  {#if formatMessage}
    <p class="text-xs text-red-700 dark:text-red-400" role="status">
      {formatMessage}
    </p>
  {/if}

  {#if validating}
    <p class="text-xs text-gray-700 dark:text-gray-300" role="status">
      {m.validate_running()}
    </p>
  {/if}
</div>
