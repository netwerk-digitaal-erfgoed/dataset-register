<script lang="ts">
  import { SvelteMap } from 'svelte/reactivity';
  import * as m from '$lib/paraglide/messages';
  import { getLocale } from '$lib/paraglide/runtime';
  import {
    shortenUri,
    stripUrlPrefix,
    truncateMiddle,
  } from '$lib/utils/prefix.js';
  import { Tooltip } from 'flowbite-svelte';
  import QuestionCircleSolid from 'flowbite-svelte-icons/QuestionCircleSolid.svelte';
  import CloseOutline from 'flowbite-svelte-icons/CloseOutline.svelte';
  import ChevronRightOutline from 'flowbite-svelte-icons/ChevronRightOutline.svelte';
  import ChevronLeftOutline from 'flowbite-svelte-icons/ChevronLeftOutline.svelte';
  import QuoteSolid from 'flowbite-svelte-icons/QuoteSolid.svelte';
  import ShareNodesSolid from 'flowbite-svelte-icons/ShareNodesSolid.svelte';

  interface DatatypeRow {
    datatype: string;
    shortDatatype: string;
    triples: number;
  }

  interface ObjectClassRow {
    class: string;
    shortClass: string;
    triples: number;
  }

  interface PropertyRow {
    property: string;
    shortProperty: string;
    entities: number;
    distinctObjects: number;
    datatypePartition?: DatatypeRow[];
    objectClassPartition?: ObjectClassRow[];
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

  interface AggregatedValueType {
    uri: string;
    shortUri: string;
    totalTriples: number;
    type: 'datatype' | 'objectClass';
    propertyCount: number;
    properties: Array<{
      property: string;
      shortProperty: string;
      triples: number;
    }>;
  }

  interface Props {
    classPartitionTable: ClassPartitionTable;
  }

  const { classPartitionTable }: Props = $props();

  const FOLD_LIMIT = 6;
  const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

  // Selection state
  type SelectionMode =
    | 'none'
    | 'class-selected'
    | 'property-selected'
    | 'value-type-selected';
  let selectionMode = $state<SelectionMode>('none');
  let selectedClass = $state<ClassRow | null>(null);
  let selectedProperty = $state<AggregatedProperty | null>(null);
  let selectedValueType = $state<AggregatedValueType | null>(null);

  // Expansion states for each panel
  let classesExpanded = $state(false);
  let propertiesExpanded = $state(false);
  let valueTypesExpanded = $state(false);

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

  // Classes to display (full list or filtered by selected property or value type)
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
    if (selectionMode === 'value-type-selected' && selectedValueType) {
      // Show only classes that have properties using the selected value type
      const vt = selectedValueType;
      return classPartitionTable.rows.filter((cls) =>
        cls.propertyPartition?.some((prop) => {
          if (vt.type === 'datatype') {
            return prop.datatypePartition?.some((dt) => dt.datatype === vt.uri);
          } else {
            return prop.objectClassPartition?.some((oc) => oc.class === vt.uri);
          }
        }),
      );
    }
    // Full list
    const list = classPartitionTable.rows;
    return classesExpanded ? list : list.slice(0, FOLD_LIMIT);
  });

  const hasMoreClasses = $derived(
    selectionMode !== 'property-selected' &&
      selectionMode !== 'value-type-selected' &&
      classPartitionTable.rows.length > FOLD_LIMIT,
  );

  // Properties to display (full list or filtered by selected class or value type)
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
    if (selectionMode === 'value-type-selected' && selectedValueType) {
      // Show only aggregated properties that have the selected value type
      const vt = selectedValueType;
      return aggregatedProperties.filter((prop) => {
        // Check if any class has this property with the selected value type
        return classPartitionTable.rows.some((cls) => {
          const classProp = cls.propertyPartition?.find(
            (p) => p.property === prop.property,
          );
          if (!classProp) return false;
          if (vt.type === 'datatype') {
            return classProp.datatypePartition?.some(
              (dt) => dt.datatype === vt.uri,
            );
          } else {
            return classProp.objectClassPartition?.some(
              (oc) => oc.class === vt.uri,
            );
          }
        });
      });
    }
    // Full aggregated list
    const list = aggregatedProperties;
    return propertiesExpanded ? list : list.slice(0, FOLD_LIMIT);
  });

  const hasMoreProperties = $derived(
    selectionMode !== 'class-selected' &&
      selectionMode !== 'value-type-selected' &&
      aggregatedProperties.length > FOLD_LIMIT,
  );

  // Total entities for percentage calculation in properties
  const totalPropertyEntities = $derived(
    displayedProperties.reduce((sum, p) => sum + p.totalEntities, 0),
  );

  function getPropertyPercent(entities: number): number {
    // When a class is selected, calculate percentage relative to class entity count
    if (selectionMode === 'class-selected' && selectedClass) {
      if (selectedClass.entities === 0) return 0;
      return (entities / selectedClass.entities) * 100;
    }
    // Otherwise, use the sum of displayed properties (relative comparison)
    if (totalPropertyEntities === 0) return 0;
    return (entities / totalPropertyEntities) * 100;
  }

  // Check if any property has value type partitions
  const hasAnyValueTypePartitions = $derived(
    classPartitionTable.rows.some((cls) =>
      cls.propertyPartition?.some(
        (prop) =>
          (prop.datatypePartition && prop.datatypePartition.length > 0) ||
          (prop.objectClassPartition && prop.objectClassPartition.length > 0),
      ),
    ),
  );

  // Aggregate value types across all properties
  const aggregatedValueTypes = $derived.by(() => {
    const typeMap = new SvelteMap<string, AggregatedValueType>();

    classPartitionTable.rows.forEach((cls) => {
      cls.propertyPartition?.forEach((prop) => {
        // Process datatype partitions
        prop.datatypePartition?.forEach((dt) => {
          const key = `datatype:${dt.datatype}`;
          const existing = typeMap.get(key) || {
            uri: dt.datatype,
            shortUri: dt.shortDatatype,
            totalTriples: 0,
            type: 'datatype' as const,
            propertyCount: 0,
            properties: [],
          };
          existing.totalTriples += dt.triples;
          existing.propertyCount++;
          existing.properties.push({
            property: prop.property,
            shortProperty: prop.shortProperty,
            triples: dt.triples,
          });
          typeMap.set(key, existing);
        });

        // Process object class partitions
        prop.objectClassPartition?.forEach((oc) => {
          const key = `objectClass:${oc.class}`;
          const existing = typeMap.get(key) || {
            uri: oc.class,
            shortUri: oc.shortClass,
            totalTriples: 0,
            type: 'objectClass' as const,
            propertyCount: 0,
            properties: [],
          };
          existing.totalTriples += oc.triples;
          existing.propertyCount++;
          existing.properties.push({
            property: prop.property,
            shortProperty: prop.shortProperty,
            triples: oc.triples,
          });
          typeMap.set(key, existing);
        });
      });
    });

    return [...typeMap.values()].sort(
      (a, b) => b.totalTriples - a.totalTriples,
    );
  });

  // Displayed value types based on selection
  const displayedValueTypes = $derived.by(() => {
    if (selectionMode === 'class-selected' && selectedClass) {
      // Show value types for properties of the selected class
      const typeMap = new SvelteMap<string, AggregatedValueType>();

      selectedClass.propertyPartition?.forEach((prop) => {
        prop.datatypePartition?.forEach((dt) => {
          const key = `datatype:${dt.datatype}`;
          const existing = typeMap.get(key) || {
            uri: dt.datatype,
            shortUri: dt.shortDatatype,
            totalTriples: 0,
            type: 'datatype' as const,
            propertyCount: 0,
            properties: [],
          };
          existing.totalTriples += dt.triples;
          existing.propertyCount++;
          existing.properties.push({
            property: prop.property,
            shortProperty: prop.shortProperty,
            triples: dt.triples,
          });
          typeMap.set(key, existing);
        });

        prop.objectClassPartition?.forEach((oc) => {
          const key = `objectClass:${oc.class}`;
          const existing = typeMap.get(key) || {
            uri: oc.class,
            shortUri: oc.shortClass,
            totalTriples: 0,
            type: 'objectClass' as const,
            propertyCount: 0,
            properties: [],
          };
          existing.totalTriples += oc.triples;
          existing.propertyCount++;
          existing.properties.push({
            property: prop.property,
            shortProperty: prop.shortProperty,
            triples: oc.triples,
          });
          typeMap.set(key, existing);
        });
      });

      return [...typeMap.values()].sort(
        (a, b) => b.totalTriples - a.totalTriples,
      );
    }

    if (selectionMode === 'property-selected' && selectedProperty) {
      // Show value types for the selected property across all classes
      const result: AggregatedValueType[] = [];
      const selectedProp = selectedProperty; // Capture for closure

      classPartitionTable.rows.forEach((cls) => {
        const prop = cls.propertyPartition?.find(
          (p) => p.property === selectedProp.property,
        );

        prop?.datatypePartition?.forEach((dt) => {
          const existing = result.find(
            (r) => r.uri === dt.datatype && r.type === 'datatype',
          );
          if (existing) {
            existing.totalTriples += dt.triples;
          } else {
            result.push({
              uri: dt.datatype,
              shortUri: dt.shortDatatype,
              totalTriples: dt.triples,
              type: 'datatype',
              propertyCount: 1,
              properties: [
                {
                  property: prop.property,
                  shortProperty: prop.shortProperty,
                  triples: dt.triples,
                },
              ],
            });
          }
        });

        prop?.objectClassPartition?.forEach((oc) => {
          const existing = result.find(
            (r) => r.uri === oc.class && r.type === 'objectClass',
          );
          if (existing) {
            existing.totalTriples += oc.triples;
          } else {
            result.push({
              uri: oc.class,
              shortUri: oc.shortClass,
              totalTriples: oc.triples,
              type: 'objectClass',
              propertyCount: 1,
              properties: [
                {
                  property: prop.property,
                  shortProperty: prop.shortProperty,
                  triples: oc.triples,
                },
              ],
            });
          }
        });
      });

      return result.sort((a, b) => b.totalTriples - a.totalTriples);
    }

    // Full aggregated list
    const list = aggregatedValueTypes;
    return valueTypesExpanded ? list : list.slice(0, FOLD_LIMIT);
  });

  const hasMoreValueTypes = $derived(
    selectionMode !== 'class-selected' &&
      selectionMode !== 'property-selected' &&
      aggregatedValueTypes.length > FOLD_LIMIT,
  );

  // Percentage calculation for value types
  const totalValueTypeTriples = $derived(
    displayedValueTypes.reduce((sum, vt) => sum + vt.totalTriples, 0),
  );

  function getValueTypePercent(triples: number): number {
    if (totalValueTypeTriples === 0) return 0;
    return (triples / totalValueTypeTriples) * 100;
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
      valueTypesExpanded = false;
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
      valueTypesExpanded = false;
    }
  }

  function clearSelection() {
    selectedClass = null;
    selectedProperty = null;
    selectedValueType = null;
    selectionMode = 'none';
  }

  function selectValueType(vt: AggregatedValueType) {
    if (
      selectionMode === 'value-type-selected' &&
      selectedValueType?.uri === vt.uri &&
      selectedValueType?.type === vt.type
    ) {
      // Deselect
      clearSelection();
    } else {
      selectedValueType = vt;
      selectedClass = null;
      selectedProperty = null;
      selectionMode = 'value-type-selected';
      classesExpanded = false;
      propertiesExpanded = false;
    }
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

  function handleValueTypeKeydown(
    event: KeyboardEvent,
    vt: AggregatedValueType,
  ) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectValueType(vt);
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
        {:else if selectionMode === 'value-type-selected' && selectedValueType}
          <button
            class="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            onclick={clearSelection}
            aria-label={m.detail_close_properties()}
            type="button"
          >
            <CloseOutline class="h-4 w-4" />
          </button>
          {m.detail_classes_for_value_type({
            valueTypeName: selectedValueType.shortUri,
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
        selectionMode === 'property-selected' ||
        selectionMode === 'value-type-selected'
          ? 'max-h-[400px] overflow-y-auto'
          : ''} {selectionMode === 'property-selected' ||
        selectionMode === 'value-type-selected'
          ? 'border-2 border-blue-200 dark:border-blue-800'
          : 'border-gray-200 dark:border-gray-700'}"
        role={hasAnyPropertyPartitions ? 'listbox' : 'list'}
        aria-label={m.detail_classes()}
      >
        <div
          class="flex items-center gap-1 sm:gap-2 px-1 sm:px-4 py-3 bg-gray-100 dark:bg-gray-700 {classesExpanded ||
          selectionMode === 'property-selected' ||
          selectionMode === 'value-type-selected'
            ? 'sticky top-0'
            : ''} rounded-t-lg text-xs font-medium uppercase text-gray-700 dark:text-gray-300"
        >
          <div class="flex-1 min-w-0">{m.detail_class()}</div>
          <div class="w-[6.25rem] sm:w-40 text-right flex-shrink-0">
            {m.detail_entities()}
          </div>
          {#if hasAnyPropertyPartitions}
            <div class="w-3 flex-shrink-0"></div>
          {/if}
        </div>
        {#each displayedClasses as row (row.className)}
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <div
            class="group flex items-center gap-1 sm:gap-2 px-1 sm:px-4 py-3 text-sm transition-all {hasAnyPropertyPartitions
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
                class="block text-blue-600 dark:text-blue-400 {hasAnyPropertyPartitions
                  ? 'group-hover:underline'
                  : ''}"
                title={row.className}
              >
                {truncateMiddle(stripUrlPrefix(shortenUri(row.className)), 25)}
              </span>
            </div>
            <div
              class="w-16 sm:w-20 text-right tabular-nums text-gray-700 dark:text-gray-300 text-xs"
            >
              {row.entities.toLocaleString(getLocale())}
            </div>
            <div class="w-8 sm:w-20 flex items-center gap-2">
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
                ><span class="sm:hidden">{Math.round(row.percent)}%</span><span
                  class="hidden sm:inline"
                  >{row.percent.toLocaleString(getLocale(), {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}%</span
                ></span
              >
            </div>
            {#if hasAnyPropertyPartitions && selectionMode !== 'property-selected' && selectionMode !== 'value-type-selected'}
              <ChevronRightOutline
                class="h-5 w-5 -mr-2 flex-shrink-0 transition-colors {selectedClass?.className ===
                row.className
                  ? 'text-blue-500'
                  : 'text-gray-300 group-hover:text-blue-400 dark:text-gray-600'}"
              />
            {:else if hasAnyPropertyPartitions}
              <div class="w-3"></div>
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
          {:else if selectionMode === 'value-type-selected' && selectedValueType}
            <button
              class="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              onclick={clearSelection}
              aria-label={m.detail_close_properties()}
              type="button"
            >
              <CloseOutline class="h-4 w-4" />
            </button>
            {m.detail_properties_for_value_type({
              valueTypeName: selectedValueType.shortUri,
            })}
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
          selectionMode === 'class-selected' ||
          selectionMode === 'value-type-selected'
            ? 'max-h-[400px] overflow-y-auto'
            : ''} {selectionMode === 'class-selected' ||
          selectionMode === 'value-type-selected'
            ? 'border-2 border-blue-200 dark:border-blue-800'
            : 'border-gray-200 dark:border-gray-700'}"
          role="listbox"
          aria-label={m.detail_properties_section()}
        >
          <div
            class="flex items-center gap-1 sm:gap-2 px-1 sm:px-4 py-3 bg-gray-100 dark:bg-gray-700 {propertiesExpanded ||
            selectionMode === 'class-selected' ||
            selectionMode === 'value-type-selected'
              ? 'sticky top-0'
              : ''} rounded-t-lg text-xs font-medium uppercase text-gray-700 dark:text-gray-300"
          >
            <div class="w-3 flex-shrink-0"></div>
            <div class="flex-1 min-w-0">{m.detail_property()}</div>
            <div class="w-[6.25rem] sm:w-40 text-right flex-shrink-0">
              {m.detail_entities()}
            </div>
            {#if hasAnyValueTypePartitions}
              <div class="w-3 flex-shrink-0"></div>
            {/if}
          </div>
          {#each displayedProperties as prop (prop.property)}
            {@const percent = getPropertyPercent(prop.totalEntities)}
            <div
              class="group flex items-center gap-1 sm:gap-2 px-1 sm:px-4 py-3 text-sm cursor-pointer transition-all hover:bg-blue-50 dark:hover:bg-blue-900/20 {selectedProperty?.property ===
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
                class="h-5 w-5 -ml-2 flex-shrink-0 transition-colors {selectedProperty?.property ===
                prop.property
                  ? 'text-blue-500'
                  : 'text-gray-300 group-hover:text-blue-400 dark:text-gray-600'}"
              />
              <div class="flex-1 min-w-0">
                <span
                  class="block text-blue-600 dark:text-blue-400 group-hover:underline"
                  title={prop.property}
                >
                  {truncateMiddle(stripUrlPrefix(prop.shortProperty), 25)}
                </span>
              </div>
              <div
                class="w-16 sm:w-20 text-right tabular-nums text-gray-700 dark:text-gray-300 text-xs"
              >
                {prop.totalEntities.toLocaleString(getLocale())}
              </div>
              <div class="w-8 sm:w-20 flex items-center gap-2">
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
                  ><span class="sm:hidden">{Math.round(percent)}%</span><span
                    class="hidden sm:inline"
                    >{percent.toLocaleString(getLocale(), {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    })}%</span
                  ></span
                >
              </div>
              {#if hasAnyValueTypePartitions && selectionMode !== 'value-type-selected'}
                <ChevronRightOutline
                  class="h-5 w-5 -mr-2 flex-shrink-0 transition-colors {selectedProperty?.property ===
                  prop.property
                    ? 'text-blue-500'
                    : 'text-gray-300 group-hover:text-blue-400 dark:text-gray-600'}"
                />
              {:else if hasAnyValueTypePartitions}
                <div class="w-3"></div>
              {/if}
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

    <!-- Value Types Panel (Right) -->
    {#if hasAnyValueTypePartitions && aggregatedValueTypes.length > 0}
      <div class="w-full lg:flex-1 min-w-0">
        <h3
          class="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white"
        >
          {#if selectionMode === 'class-selected' && selectedClass}
            {m.detail_value_types_for_class({
              className: selectedClass.shortName,
            })}
          {:else if selectionMode === 'property-selected' && selectedProperty}
            {m.detail_value_types_for_property({
              propertyName: selectedProperty.shortProperty,
            })}
          {:else}
            {m.detail_value_types()}
            <span id="tooltip-value-types-widget">
              <QuestionCircleSolid
                class="h-5 w-5 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
              />
            </span>
            <Tooltip triggeredBy="#tooltip-value-types-widget">
              {m.detail_value_types_description()}
            </Tooltip>
          {/if}
        </h3>

        <div
          class="divide-y divide-gray-200 rounded-lg border bg-white dark:divide-gray-700 dark:bg-gray-800 {valueTypesExpanded ||
          selectionMode === 'class-selected' ||
          selectionMode === 'property-selected'
            ? 'max-h-[400px] overflow-y-auto'
            : ''} {selectionMode === 'class-selected' ||
          selectionMode === 'property-selected'
            ? 'border-2 border-blue-200 dark:border-blue-800'
            : 'border-gray-200 dark:border-gray-700'}"
          role="listbox"
          aria-label={m.detail_value_types()}
        >
          <div
            class="flex items-center gap-1 sm:gap-2 px-1 sm:px-4 py-3 bg-gray-100 dark:bg-gray-700 {valueTypesExpanded ||
            selectionMode === 'class-selected' ||
            selectionMode === 'property-selected'
              ? 'sticky top-0'
              : ''} rounded-t-lg text-xs font-medium uppercase text-gray-700 dark:text-gray-300"
          >
            <div class="w-3 flex-shrink-0"></div>
            <div class="w-5 flex-shrink-0"></div>
            <div class="flex-1 min-w-0">{m.detail_value_type()}</div>
            <div class="w-[6.25rem] sm:w-40 text-right flex-shrink-0">
              {m.detail_triples()}
            </div>
          </div>
          {#each displayedValueTypes as vt (`${vt.type}:${vt.uri}`)}
            {@const percent = getValueTypePercent(vt.totalTriples)}
            {@const isSelected =
              selectionMode === 'value-type-selected' &&
              selectedValueType?.uri === vt.uri &&
              selectedValueType?.type === vt.type}
            <div
              class="group flex items-center gap-1 sm:gap-2 px-1 sm:px-4 py-3 text-sm transition-all cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 {isSelected
                ? 'bg-blue-100 dark:bg-blue-900/30'
                : ''}"
              role="option"
              aria-selected={isSelected}
              tabindex="0"
              onclick={() => selectValueType(vt)}
              onkeydown={(e) => handleValueTypeKeydown(e, vt)}
            >
              <ChevronLeftOutline
                class="h-5 w-5 -ml-2 flex-shrink-0 transition-colors {isSelected
                  ? 'text-blue-500'
                  : 'text-gray-300 group-hover:text-blue-400 dark:text-gray-600'}"
              />
              <!-- Type indicator icon -->
              <div class="w-5 flex-shrink-0">
                {#if vt.type === 'datatype'}
                  <span
                    class="text-blue-500 dark:text-blue-400"
                    title={m.detail_datatype()}
                  >
                    <QuoteSolid class="h-4 w-4" />
                  </span>
                {:else}
                  <span
                    class="text-cyan-500 dark:text-cyan-400"
                    title={m.detail_object_class()}
                  >
                    <ShareNodesSolid class="h-4 w-4" />
                  </span>
                {/if}
              </div>
              <div class="flex-1 min-w-0">
                <span
                  class="block text-blue-600 dark:text-blue-400 group-hover:underline"
                  title={vt.uri}
                >
                  {truncateMiddle(stripUrlPrefix(vt.shortUri), 25)}
                </span>
              </div>
              <div
                class="w-16 sm:w-20 text-right tabular-nums text-gray-700 dark:text-gray-300 text-xs"
              >
                {vt.totalTriples.toLocaleString(getLocale())}
              </div>
              <div class="w-8 sm:w-20 flex items-center gap-2">
                <div
                  class="hidden sm:block flex-1 h-2 bg-gray-200 rounded-full dark:bg-gray-600"
                >
                  <div
                    class="h-2 {vt.type === 'datatype'
                      ? 'bg-blue-500'
                      : 'bg-cyan-500'} rounded-full"
                    style="width: {percent}%"
                  ></div>
                </div>
                <span
                  class="text-xs w-full sm:w-10 text-right tabular-nums text-gray-600 dark:text-gray-400"
                >
                  <span class="sm:hidden">{Math.round(percent)}%</span><span
                    class="hidden sm:inline"
                    >{percent.toLocaleString(getLocale(), {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    })}%</span
                  >
                </span>
              </div>
            </div>
          {/each}
        </div>

        {#if hasMoreValueTypes}
          <button
            class="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium transition-colors cursor-pointer"
            onclick={() => (valueTypesExpanded = !valueTypesExpanded)}
            type="button"
          >
            {valueTypesExpanded ? m.facets_show_less() : m.facets_show_more()}
          </button>
        {/if}
      </div>
    {/if}
  </div>
</div>
