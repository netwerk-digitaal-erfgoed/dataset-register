<script lang="ts">
  import { Alert } from 'flowbite-svelte';
  import CheckCircleSolid from 'flowbite-svelte-icons/CheckCircleSolid.svelte';
  import ExclamationCircleSolid from 'flowbite-svelte-icons/ExclamationCircleSolid.svelte';
  import InfoCircleSolid from 'flowbite-svelte-icons/InfoCircleSolid.svelte';
  import SeverityBadge from './SeverityBadge.svelte';
  import * as m from '$lib/paraglide/messages';
  import type { ShaclReport } from '$lib/services/shacl-report.js';
  import type { ApiErrorDetails } from '$lib/services/validation.js';

  interface Props {
    state:
      | { kind: 'empty' }
      | { kind: 'running' }
      | { kind: 'report'; report: ShaclReport }
      | { kind: 'parse-error'; message: string }
      | { kind: 'not-found'; details?: ApiErrorDetails }
      | { kind: 'no-dataset'; details?: ApiErrorDetails }
      | { kind: 'error'; message: string };
    submitHref?: string;
    onExpand?: (section: 'warnings' | 'infos') => void;
  }

  const { state, submitHref, onExpand }: Props = $props();

  const counts = $derived.by(() => {
    if (state.kind !== 'report') {
      return { violations: 0, warnings: 0, infos: 0 };
    }
    // Count unique messages per severity. Multiple focus nodes failing the
    // same check collapse into one — the user wants to see the number of
    // distinct problems to fix, not one row per affected node.
    const seen = new Map<string, 'Violation' | 'Warning' | 'Info'>();
    for (const result of state.report.results) {
      const key = `${result.severity}\u0001${result.message}`;
      if (!seen.has(key)) seen.set(key, result.severity);
    }
    let violations = 0;
    let warnings = 0;
    let infos = 0;
    for (const severity of seen.values()) {
      if (severity === 'Violation') violations++;
      else if (severity === 'Warning') warnings++;
      else infos++;
    }
    return { violations, warnings, infos };
  });

  type AlertColor = 'green' | 'red' | 'yellow' | 'blue';
  const color = $derived<AlertColor>(
    state.kind === 'report'
      ? counts.violations > 0
        ? 'red'
        : counts.warnings > 0
          ? 'yellow'
          : 'green'
      : state.kind === 'running'
        ? 'blue'
        : 'red',
  );

  const toneClass = $derived(
    color === 'red'
      ? 'dark:!bg-red-950 dark:!text-red-50 dark:!border-red-800'
      : color === 'yellow'
        ? 'dark:!bg-amber-950 dark:!text-amber-50 dark:!border-amber-700'
        : color === 'green'
          ? 'dark:!bg-green-950 dark:!text-green-50 dark:!border-green-800'
          : 'dark:!bg-blue-950 dark:!text-blue-50 dark:!border-blue-800',
  );
</script>

<Alert {color} border class="text-gray-900 dark:text-white {toneClass}">
  {#snippet icon()}
    {#if color === 'green'}
      <CheckCircleSolid class="h-6 w-6" />
    {:else if color === 'blue'}
      <InfoCircleSolid class="h-6 w-6" />
    {:else}
      <ExclamationCircleSolid class="h-6 w-6" />
    {/if}
  {/snippet}

  {#if state.kind === 'running'}
    <span class="font-semibold">{m.validate_running()}</span>
  {:else if state.kind === 'report'}
    {@const status =
      counts.violations > 0
        ? 'invalid'
        : counts.warnings > 0
          ? 'warnings-only'
          : 'valid'}
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-lg font-semibold">
        {#if status === 'invalid'}{m.validate_summary_invalid()}
        {:else if status === 'warnings-only'}{m.validate_summary_warnings_only()}
        {:else}{m.validate_summary_valid()}{/if}
      </span>
      {#if counts.violations > 0}
        <SeverityBadge tone="red" large>
          {m.validate_summary_violations({ count: counts.violations })}
        </SeverityBadge>
      {/if}
      {#if counts.warnings > 0}
        <SeverityBadge
          tone="yellow"
          large
          onclick={onExpand ? () => onExpand('warnings') : undefined}
        >
          {m.validate_summary_warnings({ count: counts.warnings })}
        </SeverityBadge>
      {/if}
      {#if counts.infos > 0}
        <SeverityBadge
          tone="blue"
          large
          onclick={onExpand ? () => onExpand('infos') : undefined}
        >
          {m.validate_summary_infos({ count: counts.infos })}
        </SeverityBadge>
      {/if}
    </div>
    <p class="mt-1 text-sm">
      {#if status === 'invalid'}{m.validate_summary_invalid_body()}
      {:else if status === 'warnings-only'}{m.validate_summary_warnings_only_body()}
      {:else}{m.validate_summary_valid_body()}{/if}
    </p>
    {#if status !== 'invalid' && submitHref}
      <p class="mt-3">
        <a
          href={submitHref}
          rel="external"
          class="inline-flex items-center gap-1 rounded-md bg-green-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600 dark:bg-green-600 dark:hover:bg-green-700 cursor-pointer"
        >
          {m.validate_summary_submit_cta()}
          <span class="sr-only">({m.opens_in_new_tab()})</span>
        </a>
      </p>
    {/if}
  {:else if state.kind === 'parse-error'}
    <span class="font-semibold">{m.validate_parse_failed_title()}</span>
    <p class="mt-1 font-mono text-sm break-words">{state.message}</p>
  {:else if state.kind === 'not-found'}
    <span class="font-semibold">
      {state.details?.title ?? m.validate_result_not_found_title()}
    </span>
    <p class="mt-1 text-sm">
      {state.details?.description ?? m.validate_result_not_found_body()}
    </p>
  {:else if state.kind === 'no-dataset'}
    <span class="font-semibold">
      {state.details?.title ?? m.validate_result_no_dataset_title()}
    </span>
    <p class="mt-1 text-sm">
      {state.details?.description ?? m.validate_result_no_dataset_body()}
    </p>
  {:else if state.kind === 'error'}
    <span class="font-semibold">{m.validate_parse_failed_title()}</span>
    <p class="mt-1 text-sm">{state.message}</p>
  {/if}
</Alert>
