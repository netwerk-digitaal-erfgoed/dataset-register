<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import type { ShaclResult } from '$lib/services/shacl-report.js';
  import { selectShape, type ShapesIndex } from '$lib/services/shacl-shapes.js';
  import { shortenUri } from '$lib/utils/prefix.js';
  import { lookupValues, type DataValue } from './lookup-values.js';
  import type { ContentType } from './detect-content-type.js';
  import SeverityBadge from './SeverityBadge.svelte';

  interface Props {
    result: ShaclResult;
    extras?: ShaclResult[];
    sourceText?: string;
    sourceContentType?: ContentType;
    focusNodeTypes?: Map<string, string>;
    shapes: ShapesIndex | null;
    onJump?: (line: number) => void;
  }

  const {
    result,
    extras = [],
    sourceText,
    sourceContentType,
    focusNodeTypes,
    shapes,
    onJump,
  }: Props = $props();

  let showAllFocusNodes = $state(false);

  const focusType = $derived(
    result.focusNode ? focusNodeTypes?.get(result.focusNode) : undefined,
  );
  const shapeMeta = $derived(
    shapes
      ? selectShape(shapes, result.path, focusType, result.sourceShape)
      : undefined,
  );
  const tone = $derived(
    result.severity === 'Violation'
      ? 'red'
      : result.severity === 'Warning'
        ? 'yellow'
        : 'blue',
  );
  const severityLabel = $derived(
    result.severity === 'Violation'
      ? m.severity_Violation()
      : result.severity === 'Warning'
        ? m.severity_Warning()
        : m.severity_Info(),
  );

  const valueSourceLine = $derived.by(() => {
    if (!sourceText) return null;
    const needle = result.value ?? result.focusNode;
    if (!needle) return null;
    const index = sourceText.indexOf(needle);
    if (index === -1) return null;
    return sourceText.slice(0, index).split(/\r?\n/).length;
  });

  let currentValues = $state<DataValue[]>([]);
  $effect(() => {
    currentValues = [];
    if (result.value) return;
    if (!sourceText || !sourceContentType) return;
    if (!result.focusNode || !result.path) return;
    void lookupValues(
      sourceText,
      sourceContentType,
      result.focusNode,
      result.path,
    ).then((values) => {
      currentValues = values;
    });
  });

  const focusNodeDisplay = $derived(
    result.focusNode && !result.focusNodeIsBlank
      ? shortenUri(result.focusNode)
      : null,
  );

  function lineFor(value: string): number | null {
    if (!sourceText) return null;
    const index = sourceText.indexOf(value);
    if (index === -1) return null;
    return sourceText.slice(0, index).split(/\r?\n/).length;
  }
</script>

<article
  class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
>
  <header class="flex flex-wrap items-start gap-2">
    <div class="min-w-0 flex-1">
      {#if result.message}
        <h3 class="text-base font-semibold text-gray-900 dark:text-white">
          <span class="mr-2 inline-flex align-middle"
            ><SeverityBadge {tone}>{severityLabel}</SeverityBadge></span
          ><span class="align-middle">{result.message}</span>
        </h3>
      {:else}
        <SeverityBadge {tone}>{severityLabel}</SeverityBadge>
      {/if}
      {#if shapeMeta?.description || result.path}
        <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          {#if result.path}
            <code class="font-mono text-xs">{shortenUri(result.path)}</code>
          {/if}
          {#if shapeMeta?.description}
            {#if result.path}<span class="mx-1">·</span>{/if}
            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
            {@html shapeMeta.description}
          {/if}
        </p>
      {/if}
    </div>
    {#if valueSourceLine !== null && onJump}
      <button
        type="button"
        onclick={() => onJump(valueSourceLine)}
        class="inline-flex shrink-0 items-center rounded-md bg-blue-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 cursor-pointer"
      >
        {m.validate_report_jump_to_line({ line: valueSourceLine })}
      </button>
    {/if}
  </header>

  <dl
    class="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-gray-700 dark:text-gray-300"
  >
    {#if result.value}
      <dt class="font-medium">{m.validate_report_value()}</dt>
      <dd>
        <code class="font-mono break-all">
          {result.valueIsIri ? shortenUri(result.value) : result.value}
        </code>
      </dd>
    {:else if currentValues.length > 0}
      <dt class="font-medium">{m.validate_report_current_values()}</dt>
      <dd>
        <ul class="space-y-1">
          {#each currentValues as value, index (index)}
            {@const display = value.isIri
              ? shortenUri(value.value)
              : value.value}
            {@const line = lineFor(value.value)}
            <li class="flex flex-wrap items-center gap-2">
              <code class="font-mono break-all">{display}</code>
              {#if value.language}
                <span class="text-gray-500 dark:text-gray-400">
                  @{value.language}
                </span>
              {/if}
              {#if line !== null && onJump}
                <button
                  type="button"
                  onclick={() => onJump(line)}
                  class="text-blue-700 underline hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:text-blue-400 cursor-pointer"
                >
                  {m.validate_report_jump_to_line({ line })}
                </button>
              {/if}
            </li>
          {/each}
        </ul>
      </dd>
    {/if}

    {#if focusNodeDisplay}
      <dt class="font-medium">{m.validate_report_focus_node()}</dt>
      <dd>
        <code class="font-mono break-all">{focusNodeDisplay}</code>
        {#if extras.length > 0}
          <button
            type="button"
            onclick={() => (showAllFocusNodes = !showAllFocusNodes)}
            class="ml-2 text-blue-700 underline hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:text-blue-400 cursor-pointer"
          >
            {#if showAllFocusNodes}
              {m.validate_report_hide_extras()}
            {:else}
              {m.validate_report_show_extras({ count: extras.length })}
            {/if}
          </button>
        {/if}
        {#if extras.length > 0 && showAllFocusNodes}
          <ul class="mt-1 space-y-0.5">
            {#each extras as extra, index (index)}
              {#if extra.focusNode && !extra.focusNodeIsBlank}
                <li>
                  <code class="font-mono break-all">
                    {shortenUri(extra.focusNode)}
                  </code>
                </li>
              {/if}
            {/each}
          </ul>
        {/if}
      </dd>
    {/if}
  </dl>
</article>
