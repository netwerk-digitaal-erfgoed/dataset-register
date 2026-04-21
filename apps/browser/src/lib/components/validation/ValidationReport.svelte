<script lang="ts">
  import { Accordion, AccordionItem } from 'flowbite-svelte';
  import SeverityBadge from './SeverityBadge.svelte';
  import * as m from '$lib/paraglide/messages';
  import type {
    ShaclReport,
    ShaclResult,
  } from '$lib/services/shacl-report.js';
  import {
    fetchShapes,
    type ShapesIndex,
  } from '$lib/services/shacl-shapes.js';
  import ResultRow from './ResultRow.svelte';
  import { buildFocusNodeTypes } from './focus-node-types.js';
  import type { ContentType } from './detect-content-type.js';

  interface Props {
    report: ShaclReport;
    sourceText?: string;
    sourceContentType?: ContentType;
    onJump?: (line: number) => void;
    warningsOpen?: boolean;
    infosOpen?: boolean;
  }

  let {
    report,
    sourceText,
    sourceContentType,
    onJump,
    warningsOpen = $bindable(false),
    infosOpen = $bindable(false),
  }: Props = $props();

  let shapes = $state<ShapesIndex | null>(null);
  let focusNodeTypes = $state<Map<string, string>>(new Map());

  $effect(() => {
    fetchShapes()
      .then((index) => {
        shapes = index;
      })
      .catch(() => {
        shapes = { byPath: new Map(), byId: new Map() };
      });
  });

  $effect(() => {
    if (!sourceText || !sourceContentType) {
      focusNodeTypes = new Map();
      return;
    }
    void buildFocusNodeTypes(sourceText, sourceContentType).then((map) => {
      focusNodeTypes = map;
    });
  });

  // Fold repeats of the same (path, message, constraint) across focus nodes —
  // common when validating a catalog where N datasets share a flaw — and sort
  // stably so the UI doesn’t shuffle between validations.
  function groupKey(result: ShaclResult): string {
    return [
      result.severity,
      result.path ?? '',
      result.sourceConstraintComponent ?? '',
      result.message,
    ].join('\u0001');
  }

  const grouped = $derived.by(() => {
    const buckets = new Map<string, ShaclResult[]>();
    for (const result of report.results) {
      const key = groupKey(result);
      const list = buckets.get(key);
      if (list) list.push(result);
      else buckets.set(key, [result]);
    }
    const violations: ShaclResult[][] = [];
    const warnings: ShaclResult[][] = [];
    const infos: ShaclResult[][] = [];
    for (const group of buckets.values()) {
      const head = group[0];
      if (head.severity === 'Violation') violations.push(group);
      else if (head.severity === 'Warning') warnings.push(group);
      else infos.push(group);
    }
    const sorter = (a: ShaclResult[], b: ShaclResult[]) => {
      const ap = a[0].path ?? '';
      const bp = b[0].path ?? '';
      if (ap !== bp) return ap.localeCompare(bp);
      return a[0].message.localeCompare(b[0].message);
    };
    violations.sort(sorter);
    warnings.sort(sorter);
    infos.sort(sorter);
    return { violations, warnings, infos };
  });
</script>

{#if grouped.violations.length > 0}
  <section class="space-y-3">
    <div class="flex items-center gap-2">
      <SeverityBadge tone="red" large>
        {grouped.violations.length}
      </SeverityBadge>
      <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
        {m.validate_report_violations_heading()}
      </h2>
    </div>
    <ul class="space-y-3">
      {#each grouped.violations as group (group[0])}
        <li>
          <ResultRow
            result={group[0]}
            extras={group.slice(1)}
            {sourceText}
            {sourceContentType}
            {focusNodeTypes}
            {shapes}
            {onJump}
          />
        </li>
      {/each}
    </ul>
  </section>
{/if}

{#if grouped.warnings.length > 0 || grouped.infos.length > 0}
  <Accordion multiple class="mt-4">
    {#if grouped.warnings.length > 0}
      <AccordionItem bind:open={warningsOpen} class="[&_button]:cursor-pointer">
        {#snippet header()}
          <span
            class="flex items-center gap-2"
            data-validation-section="warnings"
          >
            <SeverityBadge tone="yellow" large>
              {grouped.warnings.length}
            </SeverityBadge>
            <span class="text-gray-900 dark:text-white">
              {m.validate_report_warnings_heading()}
            </span>
          </span>
        {/snippet}
        <ul class="space-y-3">
          {#each grouped.warnings as group (group[0])}
            <li>
              <ResultRow
                result={group[0]}
                extras={group.slice(1)}
                {sourceText}
                {sourceContentType}
                {focusNodeTypes}
                {shapes}
                {onJump}
              />
            </li>
          {/each}
        </ul>
      </AccordionItem>
    {/if}
    {#if grouped.infos.length > 0}
      <AccordionItem bind:open={infosOpen} class="[&_button]:cursor-pointer">
        {#snippet header()}
          <span
            class="flex items-center gap-2"
            data-validation-section="infos"
          >
            <SeverityBadge tone="blue" large>
              {grouped.infos.length}
            </SeverityBadge>
            <span class="text-gray-900 dark:text-white">
              {m.validate_report_infos_heading()}
            </span>
          </span>
        {/snippet}
        <ul class="space-y-3">
          {#each grouped.infos as group (group[0])}
            <li>
              <ResultRow
                result={group[0]}
                extras={group.slice(1)}
                {sourceText}
                {sourceContentType}
                {focusNodeTypes}
                {shapes}
                {onJump}
              />
            </li>
          {/each}
        </ul>
      </AccordionItem>
    {/if}
  </Accordion>
{/if}
