<script lang="ts">
  import { SvelteMap } from 'svelte/reactivity';
  import * as m from '$lib/paraglide/messages';
  import { getLocale } from '$lib/paraglide/runtime';
  import { shortenUri, truncateMiddle } from '$lib/utils/prefix.js';
  import { Tooltip } from 'flowbite-svelte';
  import QuestionCircleSolid from 'flowbite-svelte-icons/QuestionCircleSolid.svelte';
  import CloseOutline from 'flowbite-svelte-icons/CloseOutline.svelte';
  import ChevronRightOutline from 'flowbite-svelte-icons/ChevronRightOutline.svelte';
  import ChevronLeftOutline from 'flowbite-svelte-icons/ChevronLeftOutline.svelte';

  interface PropertyRow {
    property: string;
    shortProperty: string;
    entities: number;
    distinctObjects: number;
  }

  interface ClassRow {
    className: string;
    shortName: string;
    entities: number;
    percent: number;
    propertyPartition?: PropertyRow[];
  }

  interface ClassPartitionTable {
    rows: ClassRow[];
  }

  interface AggregatedProperty {
    property: string;
    shortProperty: string;
    totalEntities: number;
    totalDistinctObjects: number;
    classCount: number;
    classes: Array<{ className: string; shortName: string; entities: number }>;
  }

  interface Props {
    classPartitionTable: ClassPartitionTable;
  }

  const { classPartitionTable }: Props = $props();

  const FOLD_LIMIT = 6;
  const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

  // Selection state
  type SelectionMode = 'none' | 'class-selected' | 'property-selected';
  let selectionMode = $state<SelectionMode>('none');
  let selectedClass = $state<ClassRow | null>(null);
  let selectedProperty = $state<AggregatedProperty | null>(null);

  // Expansion states for each panel
  let classesExpanded = $state(false);
  let propertiesExpanded = $state(false);

  // Check if any class has property partitions available
  const hasAnyPropertyPartitions = $derived(
    classPartitionTable.rows.some(
      (row) => row.propertyPartition && row.propertyPartition.length > 0,
    ),
  );

  // Aggregate properties across all classes
  const aggregatedProperties = $derived.by(() => {
    const propMap = new SvelteMap<string, AggregatedProperty>();

    classPartitionTable.rows.forEach((cls) => {
      cls.propertyPartition?.forEach((prop) => {
        // Skip rdf:type - it's redundant with the Classes panel
        if (prop.property === RDF_TYPE) return;

        const existing = propMap.get(prop.property) || {
          property: prop.property,
          shortProperty: shortenUri(prop.property),
          totalEntities: 0,
          totalDistinctObjects: 0,
          classCount: 0,
          classes: [],
        };
        existing.totalEntities += prop.entities;
        existing.totalDistinctObjects += prop.distinctObjects;
        existing.classCount++;
        existing.classes.push({
          className: cls.className,
          shortName: cls.shortName,
          entities: prop.entities,
        });
        propMap.set(prop.property, existing);
      });
    });

    return [...propMap.values()].sort(
      (a, b) => b.totalEntities - a.totalEntities,
    );
  });

  // Classes to display (full list or filtered by selected property)
  const displayedClasses = $derived.by(() => {
    if (selectionMode === 'property-selected' && selectedProperty) {
      // Show only classes that use the selected property
      return selectedProperty.classes.map((c) => {
        const fullClass = classPartitionTable.rows.find(
          (r) => r.className === c.className,
        );
        return {
          className: c.className,
          shortName: c.shortName,
          entities: c.entities,
          percent: fullClass?.percent ?? 0,
          propertyPartition: fullClass?.propertyPartition,
        };
      });
    }
    // Full list
    const list = classPartitionTable.rows;
    return classesExpanded ? list : list.slice(0, FOLD_LIMIT);
  });

  const hasMoreClasses = $derived(
    selectionMode !== 'property-selected' &&
      classPartitionTable.rows.length > FOLD_LIMIT,
  );

  // Properties to display (full list or filtered by selected class)
  const displayedProperties = $derived.by(() => {
    const cls = selectedClass;
    if (selectionMode === 'class-selected' && cls?.propertyPartition) {
      // Show properties for the selected class (excluding rdf:type)
      return [...cls.propertyPartition]
        .filter((p) => p.property !== RDF_TYPE)
        .sort((a, b) => b.entities - a.entities)
        .map((p) => ({
          property: p.property,
          shortProperty: p.shortProperty,
          totalEntities: p.entities,
          totalDistinctObjects: p.distinctObjects,
          classCount: 1,
          classes: [
            {
              className: cls.className,
              shortName: cls.shortName,
              entities: p.entities,
            },
          ],
        }));
    }
    // Full aggregated list
    const list = aggregatedProperties;
    return propertiesExpanded ? list : list.slice(0, FOLD_LIMIT);
  });

  const hasMoreProperties = $derived(
    selectionMode !== 'class-selected' &&
      aggregatedProperties.length > FOLD_LIMIT,
  );

  // Total entities for percentage calculation in properties
  const totalPropertyEntities = $derived(
    displayedProperties.reduce((sum, p) => sum + p.totalEntities, 0),
  );

  function getPropertyPercent(entities: number): number {
    if (totalPropertyEntities === 0) return 0;
    return (entities / totalPropertyEntities) * 100;
  }

  function selectClass(row: ClassRow) {
    if (selectedClass?.className === row.className) {
      // Deselect
      clearSelection();
    } else {
      selectedClass = row;
      selectedProperty = null;
      selectionMode = 'class-selected';
      propertiesExpanded = false;
    }
  }

  function selectProperty(prop: AggregatedProperty) {
    if (selectedProperty?.property === prop.property) {
      // Deselect
      clearSelection();
    } else {
      selectedProperty = prop;
      selectedClass = null;
      selectionMode = 'property-selected';
      classesExpanded = false;
    }
  }

  function clearSelection() {
    selectedClass = null;
    selectedProperty = null;
    selectionMode = 'none';
  }

  function handleClassKeydown(event: KeyboardEvent, row: ClassRow) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectClass(row);
    } else if (event.key === 'Escape') {
      clearSelection();
    }
  }

  function handlePropertyKeydown(
    event: KeyboardEvent,
    prop: AggregatedProperty,
  ) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectProperty(prop);
    } else if (event.key === 'Escape') {
      clearSelection();
    }
  }
</script>

<!-- Side-by-Side Classes & Properties Widget -->
<div class="mt-6">
  <div class="flex flex-col lg:flex-row gap-4">
    <!-- Classes Panel (Left) -->
    <div class="w-full lg:flex-1 min-w-0">
      <h3
        class="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white"
      >
        {#if selectionMode === 'property-selected' && selectedProperty}
          <button
            class="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            onclick={clearSelection}
            aria-label={m.detail_close_properties()}
            type="button"
          >
            <CloseOutline class="h-4 w-4" />
          </button>
          {m.detail_classes_for_property({
            propertyName: selectedProperty.shortProperty,
          })}
        {:else}
          {m.detail_classes()}
          <span id="tooltip-classes-widget">
            <QuestionCircleSolid
              class="h-5 w-5 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
            />
          </span>
          <Tooltip triggeredBy="#tooltip-classes-widget"
            >{m.detail_classes_description()}</Tooltip
          >
        {/if}
      </h3>

      <div
        class="divide-y divide-gray-200 rounded-lg border bg-white dark:divide-gray-700 dark:bg-gray-800 {classesExpanded ||
        selectionMode === 'property-selected'
          ? 'max-h-[400px] overflow-y-auto'
          : ''} {selectionMode === 'property-selected'
          ? 'border-2 border-blue-200 dark:border-blue-800'
          : 'border-gray-200 dark:border-gray-700'}"
        role={hasAnyPropertyPartitions ? 'listbox' : 'list'}
        aria-label={m.detail_classes()}
      >
        <div
          class="flex items-center gap-2 sm:gap-4 px-4 py-3 bg-gray-100 dark:bg-gray-700 {classesExpanded ||
          selectionMode === 'property-selected'
            ? 'sticky top-0'
            : ''} rounded-t-lg text-xs font-medium uppercase text-gray-700 dark:text-gray-300"
        >
          <div class="flex-1">{m.detail_class()}</div>
          <div class="w-16 sm:w-24 text-right">{m.detail_entities()}</div>
          <div class="w-12 sm:w-20">%</div>
        </div>
        {#each displayedClasses as row (row.className)}
          <div
            class="group flex items-center gap-2 sm:gap-4 px-4 py-3 text-sm transition-all {hasAnyPropertyPartitions
              ? 'cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20'
              : ''} {selectedClass?.className === row.className
              ? 'bg-blue-100 dark:bg-blue-900/30'
              : ''}"
            role={hasAnyPropertyPartitions ? 'option' : undefined}
            aria-selected={hasAnyPropertyPartitions
              ? selectedClass?.className === row.className
              : undefined}
            tabindex={hasAnyPropertyPartitions ? 0 : undefined}
            onclick={hasAnyPropertyPartitions
              ? () => selectClass(row)
              : undefined}
            onkeydown={hasAnyPropertyPartitions
              ? (e) => handleClassKeydown(e, row)
              : undefined}
          >
            <div class="flex-1 min-w-0">
              <span
                class="text-blue-600 dark:text-blue-400 {hasAnyPropertyPartitions
                  ? 'group-hover:underline'
                  : ''}"
                title={row.className}
              >
                <span class="hidden sm:inline">{shortenUri(row.className)}</span
                >
                <span class="sm:hidden"
                  >{truncateMiddle(shortenUri(row.className), 18)}</span
                >
              </span>
            </div>
            <div
              class="w-16 sm:w-24 text-right tabular-nums text-gray-700 dark:text-gray-300"
            >
              {row.entities.toLocaleString(getLocale())}
            </div>
            <div class="w-12 sm:w-20 flex items-center gap-2">
              <div
                class="hidden sm:block flex-1 h-2 bg-gray-200 rounded-full dark:bg-gray-600"
              >
                <div
                  class="h-2 bg-blue-600 rounded-full"
                  style="width: {row.percent}%"
                ></div>
              </div>
              <span
                class="text-xs w-full sm:w-10 text-right tabular-nums text-gray-600 dark:text-gray-400"
                >{row.percent.toLocaleString(getLocale(), {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })}%</span
              >
            </div>
            {#if hasAnyPropertyPartitions && selectionMode !== 'property-selected'}
              <ChevronRightOutline
                class="h-5 w-5 flex-shrink-0 transition-colors {selectedClass?.className ===
                row.className
                  ? 'text-blue-500'
                  : 'text-gray-300 group-hover:text-blue-400 dark:text-gray-600'}"
              />
            {:else if hasAnyPropertyPartitions}
              <div class="w-5"></div>
            {/if}
          </div>
        {/each}
      </div>

      {#if hasMoreClasses}
        <button
          class="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium transition-colors cursor-pointer"
          onclick={() => (classesExpanded = !classesExpanded)}
          type="button"
        >
          {classesExpanded ? m.facets_show_less() : m.facets_show_more()}
        </button>
      {/if}
    </div>

    <!-- Properties Panel (Right) -->
    {#if aggregatedProperties.length > 0}
      <div class="w-full lg:flex-1 min-w-0">
        <h3
          class="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white"
        >
          {#if selectionMode === 'class-selected' && selectedClass}
            {m.detail_properties_for_class({
              className: selectedClass.shortName,
            })}
            <button
              class="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              onclick={clearSelection}
              aria-label={m.detail_close_properties()}
              type="button"
            >
              <CloseOutline class="h-4 w-4" />
            </button>
          {:else}
            {m.detail_properties_section()}
            <span id="tooltip-properties-widget">
              <QuestionCircleSolid
                class="h-5 w-5 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
              />
            </span>
            <Tooltip triggeredBy="#tooltip-properties-widget"
              >{m.detail_properties_section_description()}</Tooltip
            >
          {/if}
        </h3>

        <div
          class="divide-y divide-gray-200 rounded-lg border bg-white dark:divide-gray-700 dark:bg-gray-800 {propertiesExpanded ||
          selectionMode === 'class-selected'
            ? 'max-h-[400px] overflow-y-auto'
            : ''} {selectionMode === 'class-selected'
            ? 'border-2 border-blue-200 dark:border-blue-800'
            : 'border-gray-200 dark:border-gray-700'}"
          role="listbox"
          aria-label={m.detail_properties_section()}
        >
          <div
            class="flex items-center gap-2 sm:gap-4 px-4 py-3 bg-gray-100 dark:bg-gray-700 {propertiesExpanded ||
            selectionMode === 'class-selected'
              ? 'sticky top-0'
              : ''} rounded-t-lg text-xs font-medium uppercase text-gray-700 dark:text-gray-300"
          >
            <div class="w-5"></div>
            <div class="flex-1">{m.detail_property()}</div>
            <div class="w-16 sm:w-24 text-right">{m.detail_entities()}</div>
            <div class="w-12 sm:w-20">%</div>
          </div>
          {#each displayedProperties as prop (prop.property)}
            {@const percent = getPropertyPercent(prop.totalEntities)}
            <div
              class="group flex items-center gap-2 sm:gap-4 px-4 py-3 text-sm cursor-pointer transition-all hover:bg-blue-50 dark:hover:bg-blue-900/20 {selectedProperty?.property ===
              prop.property
                ? 'bg-blue-100 dark:bg-blue-900/30'
                : ''}"
              role="option"
              aria-selected={selectedProperty?.property === prop.property}
              tabindex="0"
              onclick={() => selectProperty(prop)}
              onkeydown={(e) => handlePropertyKeydown(e, prop)}
            >
              <ChevronLeftOutline
                class="h-5 w-5 flex-shrink-0 transition-colors {selectedProperty?.property ===
                prop.property
                  ? 'text-blue-500'
                  : 'text-gray-300 group-hover:text-blue-400 dark:text-gray-600'}"
              />
              <div class="flex-1 min-w-0">
                <span
                  class="text-blue-600 dark:text-blue-400 group-hover:underline"
                  title={prop.property}
                >
                  <span class="hidden sm:inline">{prop.shortProperty}</span>
                  <span class="sm:hidden"
                    >{truncateMiddle(prop.shortProperty, 18)}</span
                  >
                </span>
              </div>
              <div
                class="w-16 sm:w-24 text-right tabular-nums text-gray-700 dark:text-gray-300"
              >
                {prop.totalEntities.toLocaleString(getLocale())}
              </div>
              <div class="w-12 sm:w-20 flex items-center gap-2">
                <div
                  class="hidden sm:block flex-1 h-2 bg-gray-200 rounded-full dark:bg-gray-600"
                >
                  <div
                    class="h-2 bg-blue-600 rounded-full"
                    style="width: {percent}%"
                  ></div>
                </div>
                <span
                  class="text-xs w-full sm:w-10 text-right tabular-nums text-gray-600 dark:text-gray-400"
                  >{percent.toLocaleString(getLocale(), {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}%</span
                >
              </div>
            </div>
          {/each}
        </div>

        {#if hasMoreProperties}
          <button
            class="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium transition-colors cursor-pointer"
            onclick={() => (propertiesExpanded = !propertiesExpanded)}
            type="button"
          >
            {propertiesExpanded ? m.facets_show_less() : m.facets_show_more()}
          </button>
        {/if}
      </div>
    {/if}
  </div>
</div>
