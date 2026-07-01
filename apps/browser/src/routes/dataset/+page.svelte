<script lang="ts">
  import {
    type DatasetDetailResult,
    type DatasetSummary,
    type DistributionDetail,
  } from '$lib/services/dataset-detail';
  import { SvelteMap } from 'svelte/reactivity';
  import * as m from '$lib/paraglide/messages';
  import { getLocale } from '$lib/paraglide/runtime';
  import { page } from '$app/state';
  import {
    isRdfDistribution,
    isSparqlDistribution,
  } from '$lib/utils/distribution';
  import {
    distributionAvailability,
    usabilityFor,
    type DistributionHealth,
    type Usability,
    type ValidityVerdict,
  } from '$lib/services/distribution-health';
  import {
    compressionSuffix,
    selectPreferredDistribution,
    sortDistributionsByAvailability,
  } from '$lib/utils/distribution-ranking';
  import {
    getLocalizedValue,
    getLocalizedArray,
    localizeHref,
  } from '$lib/utils/i18n.js';
  import { getLicenseName } from '$lib/utils/license.js';
  import { shortenUri, languageCode } from '$lib/utils/prefix.js';
  import { getMediaTypeLabel } from '$lib/utils/media-type.js';
  import { datasetDetailHref } from '$lib/url';
  import { encodeUrlParam } from '$lib/utils/url-param.js';
  import LanguageBadge from '$lib/components/LanguageBadge.svelte';
  import {
    Alert,
    Clipboard,
    Dropdown,
    DropdownDivider,
    DropdownItem,
    Tooltip,
  } from 'flowbite-svelte';
  import CheckOutline from 'flowbite-svelte-icons/CheckOutline.svelte';
  import ChevronDownOutline from 'flowbite-svelte-icons/ChevronDownOutline.svelte';
  import ClipboardCleanSolid from 'flowbite-svelte-icons/ClipboardCleanSolid.svelte';
  import DownloadOutline from 'flowbite-svelte-icons/DownloadOutline.svelte';
  import ArrowUpRightFromSquareOutline from 'flowbite-svelte-icons/ArrowUpRightFromSquareOutline.svelte';
  import InfoCircleSolid from 'flowbite-svelte-icons/InfoCircleSolid.svelte';
  import SearchOutline from 'flowbite-svelte-icons/SearchOutline.svelte';
  import ExclamationCircleOutline from 'flowbite-svelte-icons/ExclamationCircleOutline.svelte';
  import {
    displayMissingProperties,
    getRegistrationStatus,
    isAnalyzed,
  } from '$lib/services/dataset-detail.js';
  import { getRelativeTimeString } from '$lib/utils/relative-time';
  import ClassPropertiesWidget from '$lib/components/ClassPropertiesWidget.svelte';
  import NdeCompatibility from '$lib/components/NdeCompatibility.svelte';

  // Data is loaded server-side via +page.ts for SEO
  const { data }: { data: DatasetDetailResult } = $props();
  const dataset = $derived(data.dataset);
  const distributions = $derived(data.distributions);
  const totalDistributions = $derived(data.totalDistributions);
  const temporalCoverages = $derived(data.temporalCoverages);
  // summary, summaryGeneratedAt, linksets, iiifManifests, persistentUris,
  // linkedData and terms now arrive via the streamed data.analysis promise (see
  // DatasetAnalysis) and are read inside the {#await} block in the template.
  const registrationHasWarnings = $derived(data.warningCount > 0);

  // SEO: canonical and hreflang URLs
  const datasetPath = $derived(datasetDetailHref(dataset.$id));
  const canonicalUrl = $derived(
    `${page.url.origin}${localizeHref(datasetPath, { locale: 'nl' })}`,
  );
  const enUrl = $derived(
    `${page.url.origin}${localizeHref(datasetPath, { locale: 'en' })}`,
  );

  function formatByteSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024)
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  // Per-distribution health from the register's own probe, streamed in parallel
  // with the page (see DatasetDetailResult.distributionHealth). It starts empty —
  // so every distribution classifies as “unknown” (no badge, nothing disabled)
  // during the brief load window — and updates reactively once the query
  // resolves.
  let healthByUrl = $state(new Map<string, DistributionHealth>());
  $effect(() => {
    let cancelled = false;
    data.distributionHealth.then((health) => {
      if (!cancelled) healthByUrl = health;
    });
    return () => {
      cancelled = true;
    };
  });

  // Per-distribution validity verdicts (the validity rail), streamed in parallel
  // like the health records. Combined with health into the usability verdict.
  let validityByUrl = $state(new Map<string, ValidityVerdict[]>());
  $effect(() => {
    let cancelled = false;
    data.distributionValidity.then((validity) => {
      if (!cancelled) validityByUrl = validity;
    });
    return () => {
      cancelled = true;
    };
  });

  // A single render-time “now” drives the staleness threshold; a few milliseconds
  // of drift between server and client render cannot change a 7-day classification.
  const now = new Date();

  // The single derived usability verdict (usable / unusable / unknown, with its
  // cause) the badge surfaces, rolling up reachability and validity.
  function usabilityForDistribution(
    distribution: DistributionDetail,
  ): Usability {
    return usabilityFor(
      healthByUrl.get(distribution.accessURL) ?? null,
      validityByUrl.get(distribution.accessURL) ?? [],
      now,
    );
  }

  // What the status badge shows: a green check when usable, or when reachable
  // with validity not yet known (no applicable verdict — e.g. a SPARQL endpoint
  // or a large dump); an amber warning when unusable; nothing when the register
  // has never probed the distribution. Falling back to reachability for the
  // 'unknown' case preserves the positive signal a reachable distribution had
  // before validity was modelled.
  type BadgeKind = 'usable' | 'reachable' | 'unusable' | 'none';
  function badgeKindFor(distribution: DistributionDetail): BadgeKind {
    const usability = usabilityForDistribution(distribution);
    if (usability.state === 'usable') return 'usable';
    if (usability.state === 'unusable') return 'unusable';
    const health = healthByUrl.get(distribution.accessURL) ?? null;
    return health !== null &&
      distributionAvailability(health, now) === 'reachable'
      ? 'reachable'
      : 'none';
  }

  // Access URLs of distributions that are reachable but serve invalid RDF, so the
  // ranking can keep them downloadable yet behind any usable distribution.
  const invalidUrls = $derived(
    new Set(
      distributions
        .filter((distribution) => {
          const usability = usabilityForDistribution(distribution);
          return (
            usability.state === 'unusable' && usability.cause === 'invalid'
          );
        })
        .map((distribution) => distribution.accessURL),
    ),
  );

  // Sort distributions availability-first (reachable before unavailable), with
  // reachable-but-invalid ones behind valid ones, then by type priority.
  const sortedDistributions = $derived(
    sortDistributionsByAvailability(
      distributions,
      healthByUrl,
      now,
      invalidUrls,
    ),
  );

  const sparqlDistributions = $derived(
    sortedDistributions.filter(isSparqlDistribution),
  );
  const downloadDistributions = $derived(
    sortedDistributions.filter((d) => !isSparqlDistribution(d)),
  );
  const rdfDownloads = $derived(
    downloadDistributions.filter(isRdfDistribution),
  );
  const otherDownloads = $derived(
    downloadDistributions.filter((d) => !isRdfDistribution(d)),
  );

  function yasguiUrl(endpoint: string): string {
    return `https://yasgui.org/#query=SELECT+*+WHERE+%7B%0A++%3Fsub+%3Fpred+%3Fobj+.%0A%7D+%0ALIMIT+10&endpoint=${encodeURIComponent(endpoint)}`;
  }

  // The default download points at a reachable (or not-yet-probed) distribution
  // so it always works; undefined when every download is unavailable, which
  // disables the primary action.
  const preferredDownload = $derived(
    selectPreferredDistribution(
      downloadDistributions,
      healthByUrl,
      now,
      invalidUrls,
    ),
  );

  // True when the only download the button could point at is reachable but serves
  // invalid RDF. selectPreferredDistribution falls back to such a distribution
  // only when no valid one exists, so the primary action surfaces a "not usable"
  // state instead of offering bytes that cannot be parsed. The dropdown still
  // lists every distribution, so the invalid bytes stay reachable for inspection.
  const preferredDownloadUnusable = $derived(
    preferredDownload !== undefined &&
      invalidUrls.has(preferredDownload.accessURL),
  );

  // Likewise for the Query action: point it at the first reachable SPARQL
  // endpoint; undefined when every endpoint is unavailable, which greys out the
  // primary action. The dropdown still lists each endpoint URL so an unavailable
  // endpoint can be inspected or copied.
  const preferredEndpoint = $derived(
    selectPreferredDistribution(
      sparqlDistributions,
      healthByUrl,
      now,
      invalidUrls,
    ),
  );

  // Extract keywords and subject matter for current locale. dcat:theme is the
  // canonical target for subject/material classification; dct:type is kept for
  // datasets registered before the schema:about → dcat:theme transition.
  const EDUC_DEFAULT_THEME =
    'http://publications.europa.eu/resource/authority/data-theme/EDUC';
  const localizedKeywords = $derived(getLocalizedArray(dataset.keyword));
  const localizedAbout = $derived([
    ...(dataset.theme?.filter((value) => value !== EDUC_DEFAULT_THEME) ?? []),
    ...getLocalizedArray(dataset.type),
  ]);

  // When the publisher and sole creator are the same entity, collapse into one row.
  const publisherIsCreator = $derived(
    dataset.publisher?.$id &&
      dataset.creator?.length === 1 &&
      dataset.creator[0].$id === dataset.publisher.$id,
  );

  // summary now arrives via the streamed data.analysis promise, so the
  // summary-derived values below are plain functions called inside the {#await}
  // block (with {@const}) rather than top-level $derived. Svelte still tracks any
  // reactive signals these read (e.g. the streamed health/validity maps), so the
  // results update as those resolve.
  function computeHasVoidStats(summary: DatasetSummary | null): boolean {
    return !!(
      summary &&
      (summary.triples != null ||
        summary.distinctSubjects != null ||
        summary.properties != null ||
        summary.distinctObjectsURI != null ||
        summary.distinctObjectsLiteral != null ||
        (summary.classPartition && summary.classPartition.length > 0) ||
        (summary.vocabulary && summary.vocabulary.length > 0))
    );
  }

  // RDF distributions (downloads or SPARQL endpoints) the Knowledge Graph would
  // summarise. A dataset offering only non-RDF downloads (CSV, PDF, …) is not
  // expected to have a Linked Data summary, so the “why is it missing” notice
  // below is never shown for it.
  const rdfDistributions = $derived(
    distributions.filter(
      (distribution) =>
        isRdfDistribution(distribution) || isSparqlDistribution(distribution),
    ),
  );

  // When there is no summary, explain why — but only when a concrete cause is
  // known: an RDF distribution that is reachable-but-invalid, or unreachable.
  // A dataset with no RDF at all, or one whose RDF is still reachable/unprobed
  // (merely pending or not yet processed), shows nothing rather than a false
  // failure. Prefers an invalid-RDF cause over a reachability one, as it is the
  // more specific explanation.
  function computeSummaryUnavailable(
    summary: DatasetSummary | null,
    hasVoidStats: boolean,
  ) {
    if (summary && hasVoidStats) return undefined;
    if (rdfDistributions.length === 0) return undefined;
    const failed =
      rdfDistributions.find((distribution) => {
        const usability = usabilityForDistribution(distribution);
        return usability.state === 'unusable' && usability.cause === 'invalid';
      }) ??
      rdfDistributions.find(
        (distribution) =>
          usabilityForDistribution(distribution).state === 'unusable',
      );
    if (!failed) return undefined;
    const invalid = usabilityForDistribution(failed).cause === 'invalid';
    const reason = invalid
      ? validityReason(validityByUrl.get(failed.accessURL) ?? [])
      : probeReason(healthByUrl.get(failed.accessURL)?.lastOutcome ?? null);
    return { invalid, reason };
  }

  // Get registration status (gone, invalid, or null)
  const registrationStatus = $derived(
    getRegistrationStatus(dataset.subjectOf?.additionalType),
  );

  // Helper function to convert language codes/URIs to display labels via Paraglide.
  function getLanguageLabel(value: string): string {
    const code = languageCode(value);
    const key: keyof typeof m = `lang_${code}` as keyof typeof m;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (m as any)[key]?.() ?? code;
  }

  type ClassPartition = NonNullable<DatasetSummary['classPartition']>[number];
  type PropertyPartition = NonNullable<
    ClassPartition['propertyPartition']
  >[number];

  // Combine property partitions that describe the same property, summing their
  // entity counts and concatenating their nested partitions (downstream views
  // re-aggregate those by key, so concatenation is safe).
  function mergePropertyPartitions(
    base: PropertyPartition[],
    addition: PropertyPartition[],
  ): PropertyPartition[] {
    const byProperty = new SvelteMap<string, PropertyPartition>();
    for (const partition of [...base, ...addition]) {
      const existing = byProperty.get(partition.property);
      if (!existing) {
        byProperty.set(partition.property, { ...partition });
        continue;
      }
      existing.entities = (existing.entities || 0) + (partition.entities || 0);
      existing.distinctObjects =
        (existing.distinctObjects || 0) + (partition.distinctObjects || 0);
      existing.datatypePartition = [
        ...(existing.datatypePartition ?? []),
        ...(partition.datatypePartition ?? []),
      ];
      existing.objectClassPartition = [
        ...(existing.objectClassPartition ?? []),
        ...(partition.objectClassPartition ?? []),
      ];
      existing.languagePartition = [
        ...(existing.languagePartition ?? []),
        ...(partition.languagePartition ?? []),
      ];
    }
    return [...byProperty.values()];
  }

  // The Knowledge Graph can emit more than one void:classPartition for the same
  // class (e.g. when that class’s instances are counted over separate subsets).
  // Collapse them into a single partition per class — summing entities and
  // merging their property partitions — so each class renders once. Without
  // this, the keyed {#each} over classes hits a duplicate key and blanks the page.
  function mergeClassPartitions(
    partitions: ClassPartition[],
  ): ClassPartition[] {
    const byClass = new SvelteMap<string, ClassPartition>();
    for (const partition of partitions) {
      const existing = byClass.get(partition.class);
      if (!existing) {
        byClass.set(partition.class, {
          ...partition,
          propertyPartition: [...(partition.propertyPartition ?? [])],
        });
        continue;
      }
      existing.entities = (existing.entities || 0) + (partition.entities || 0);
      existing.propertyPartition = mergePropertyPartitions(
        existing.propertyPartition ?? [],
        partition.propertyPartition ?? [],
      );
    }
    return [...byClass.values()];
  }

  // Table data for all class partitions with nested property partitions
  function buildClassPartitionTable(summary: DatasetSummary | null) {
    if (!summary?.classPartition?.length) return undefined;

    const sorted = mergeClassPartitions(summary.classPartition).sort(
      (a, b) => (b.entities || 0) - (a.entities || 0),
    );

    const total = sorted.reduce((sum, p) => sum + (p.entities || 0), 0);

    return {
      rows: sorted.map((p) => {
        const className = p.class || 'Unknown';
        const shortName =
          className.includes('/') || className.includes('#')
            ? className.split(/[/#]/).pop() || className
            : className;
        const entities = p.entities || 0;
        const percent = total > 0 ? (entities / total) * 100 : 0;

        // Include property partition data for the master-detail widget
        const propertyPartition = p.propertyPartition?.map((pp) => ({
          property: pp.property || 'Unknown',
          shortProperty: shortenUri(pp.property || 'Unknown'),
          entities: pp.entities || 0,
          distinctObjects: pp.distinctObjects || 0,
          datatypePartition: pp.datatypePartition?.map((dt) => ({
            datatype: dt.datatype || 'Unknown',
            shortDatatype: shortenUri(dt.datatype || 'Unknown'),
            triples: dt.triples || 0,
          })),
          objectClassPartition: pp.objectClassPartition?.map((oc) => ({
            class: oc.class || 'Unknown',
            shortClass: shortenUri(oc.class || 'Unknown'),
            triples: oc.triples || 0,
          })),
          languagePartition: pp.languagePartition?.map((lp) => ({
            language: lp.language || '',
            displayLabel: getLanguageLabel(lp.language || ''),
            triples: lp.triples || 0,
          })),
        }));

        return { className, shortName, entities, percent, propertyPartition };
      }),
      total,
    };
  }

  const splitBtnMainClass =
    'inline-flex items-center rounded-s-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 focus:z-10 focus:ring-2 focus:ring-blue-300 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800';
  // Disabled primary action shown when no download is reachable. gray-700 on
  // gray-200 keeps the label well above WCAG AA contrast even though disabled
  // controls are exempt.
  const splitBtnMainDisabledClass =
    'inline-flex items-center rounded-s-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 cursor-not-allowed dark:bg-gray-700 dark:text-gray-300';
  const splitBtnChevronClass =
    'inline-flex cursor-pointer items-center rounded-e-lg border-s border-blue-800 bg-blue-700 px-2 py-2 text-sm font-medium text-white hover:bg-blue-800 focus:z-10 focus:ring-2 focus:ring-blue-300 dark:border-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800';

  function formatHealthDate(date: Date): string {
    return date.toLocaleDateString(getLocale());
  }

  // A localized sentence describing why a distribution is unreachable, keyed on
  // the nde-probe outcome's local name. (EmptyBody and RdfParseFailed migrated to
  // the validity rail, so they are no longer reachability outcomes here.)
  function probeReason(outcome: string | null): string {
    switch (outcome?.split('#').pop()) {
      case 'NetworkError':
        return m.detail_probe_network_error();
      case 'NotFound':
        return m.detail_probe_not_found();
      case 'ServerError':
        return m.detail_probe_server_error();
      case 'AuthRequired':
        return m.detail_probe_auth_required();
      case 'RateLimited':
        return m.detail_probe_rate_limited();
      case 'SparqlProbeFailed':
        return m.detail_probe_sparql_failed();
      case 'ContentTypeMismatch':
        return m.detail_probe_content_type_mismatch();
      case 'ContentTypeMissing':
        return m.detail_probe_content_type_missing();
      default:
        return m.detail_probe_unavailable_generic();
    }
  }

  // A localized sentence describing why a distribution's RDF is invalid, plus the
  // parser message where one is available. Reads the deepest applicable verdict,
  // matching the usability rollup's depth preference.
  function validityReason(verdicts: readonly ValidityVerdict[]): string {
    const invalid =
      verdicts.find((verdict) => verdict.depth === 'deep' && !verdict.valid) ??
      verdicts.find((verdict) => !verdict.valid);
    const base =
      invalid?.reason === 'empty'
        ? m.detail_validity_empty()
        : invalid?.reason === 'parse-error'
          ? m.detail_validity_parse_error()
          : m.detail_validity_invalid_generic();
    return invalid?.message ? `${base} ${invalid.message}` : base;
  }

  // Tooltip text for a distribution's status badge: the cause (unreachable vs
  // invalid RDF) with its typed reason when unusable, a note when the verdict is
  // only shallow, a plain "reachable" line when validity is not yet known, and
  // when the register last checked it.
  function usabilityTooltip(
    kind: BadgeKind,
    usability: Usability,
    health: DistributionHealth | null,
    verdicts: readonly ValidityVerdict[],
  ): string {
    const parts: string[] = [];
    if (kind === 'unusable' && usability.cause === 'invalid') {
      parts.push(validityReason(verdicts));
    } else if (kind === 'unusable') {
      parts.push(probeReason(health?.lastOutcome ?? null));
      if (health?.firstFailureAt) {
        parts.push(
          m.detail_distribution_unavailable_since({
            date: formatHealthDate(health.firstFailureAt),
          }),
        );
      }
    } else if (kind === 'usable') {
      parts.push(m.detail_usability_usable_tooltip());
      if (usability.shallow) {
        parts.push(m.detail_usability_shallow_note());
      }
    } else {
      // reachable, validity not yet known
      parts.push(m.detail_usability_reachable_tooltip());
    }
    if (health?.lastProbedAt) {
      parts.push(
        m.detail_distribution_last_checked({
          date: formatHealthDate(health.lastProbedAt),
        }),
      );
    }
    return parts.join(' ');
  }
</script>

<svelte:head>
  <title>{getLocalizedValue(dataset.title)} | Netwerk Digitaal Erfgoed</title>
  {#if dataset.description}
    <meta content={getLocalizedValue(dataset.description)} name="description" />
  {/if}
  <link rel="canonical" href={canonicalUrl} />
  <link rel="alternate" hreflang="nl" href={canonicalUrl} />
  <link rel="alternate" hreflang="en" href={enUrl} />
  <link rel="alternate" hreflang="x-default" href={canonicalUrl} />
</svelte:head>

{#snippet statusBadge(distribution: DistributionDetail, tooltipId: string)}
  {@const kind = badgeKindFor(distribution)}
  {#if kind !== 'none'}
    {@const usability = usabilityForDistribution(distribution)}
    {@const health = healthByUrl.get(distribution.accessURL) ?? null}
    {@const verdicts = validityByUrl.get(distribution.accessURL) ?? []}
    <span id={tooltipId} class="inline-flex cursor-help items-center">
      {#if kind === 'unusable'}
        <ExclamationCircleOutline
          class="h-4 w-4 text-amber-600 dark:text-amber-500"
        />
        <span class="sr-only">{m.detail_usability_unusable()}</span>
      {:else}
        <CheckOutline class="h-4 w-4 text-green-600 dark:text-green-400" />
        <span class="sr-only"
          >{kind === 'usable'
            ? m.detail_usability_usable()
            : m.detail_usability_reachable()}</span
        >
      {/if}
    </span>
    <Tooltip triggeredBy="#{tooltipId}"
      >{usabilityTooltip(kind, usability, health, verdicts)}</Tooltip
    >
  {/if}
{/snippet}

{#snippet copyButton(url: string)}
  <Clipboard value={url} embedded class="ms-auto p-0">
    {#snippet children(success)}
      <Tooltip>{success ? m.detail_copied() : m.detail_copy()}</Tooltip>
      {#if success}<CheckOutline
          class="h-4 w-4 text-gray-500 dark:text-gray-400"
        />{:else}<ClipboardCleanSolid
          class="h-4 w-4 text-gray-500 dark:text-gray-400"
        />{/if}
    {/snippet}
  </Clipboard>
{/snippet}

{#snippet downloadDropdownItem(
  distribution: DistributionDetail,
  tooltipPrefix: string,
  distIndex: number,
)}
  <DropdownItem
    classes={{ item: 'flex flex-col items-start gap-1 !whitespace-normal' }}
  >
    <div class="flex w-full items-center gap-2">
      {#if distribution.mediaType}
        <span
          class="inline-flex items-center truncate rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-800 dark:bg-gray-700 dark:text-gray-300"
          title={distribution.mediaType}
        >
          {getMediaTypeLabel(distribution.mediaType)}{compressionSuffix(
            distribution,
          )}
        </span>
      {/if}
      {#if distribution.byteSize}
        <span class="text-xs text-gray-500 dark:text-gray-400">
          {formatByteSize(distribution.byteSize)}
        </span>
      {/if}
      {@render statusBadge(
        distribution,
        `tooltip-${tooltipPrefix}-status-${distIndex}`,
      )}
      {@render copyButton(distribution.accessURL)}
    </div>
    <a
      href={distribution.accessURL}
      target="_blank"
      rel="noopener noreferrer"
      class="block max-w-full truncate text-xs text-blue-600 hover:underline dark:text-blue-400"
      title={distribution.accessURL}
    >
      {distribution.accessURL}
      <span class="sr-only"> ({m.opens_in_new_tab()})</span>
    </a>
    {#if distribution.documentation}
      <a
        href={distribution.documentation}
        target="_blank"
        rel="noopener noreferrer"
        class="block max-w-full truncate text-xs text-blue-600 hover:underline dark:text-blue-400"
        title={distribution.documentation}
      >
        {m.detail_distribution_documentation()}: {distribution.documentation}
        <span class="sr-only"> ({m.opens_in_new_tab()})</span>
      </a>
    {/if}
    {#if distribution.description}
      <span class="text-xs text-gray-500 dark:text-gray-400">
        {getLocalizedValue(distribution.description)}
      </span>
    {/if}
    {#if distribution.issued || distribution.modified}
      <div
        class="flex flex-wrap gap-x-3 text-xs text-gray-500 dark:text-gray-400"
      >
        {#if distribution.issued}
          <span
            >{m.detail_issued()}: {new Date(
              distribution.issued,
            ).toLocaleDateString(getLocale())}</span
          >
        {/if}
        {#if distribution.modified}
          <span
            >{m.detail_modified()}: {new Date(
              distribution.modified,
            ).toLocaleDateString(getLocale())}</span
          >
        {/if}
      </div>
    {/if}
  </DropdownItem>
{/snippet}

<div class="mx-auto max-w-7xl px-1 sm:px-6 lg:px-8">
  <!-- Gone/Invalid Dataset Warning -->
  {#if registrationStatus === 'invalid' || registrationStatus === 'gone'}
    <Alert border color="red" class="mb-6">
      {#snippet icon()}
        <ExclamationCircleOutline class="h-5 w-5" />
      {/snippet}
      <p class="font-semibold">{m.detail_archived_warning()}</p>
      <p>{m.detail_archived_message()}</p>
    </Alert>
  {/if}

  <!-- Dataset Header -->
  <div class="mb-8">
    <h1
      class="mb-4 text-3xl font-bold leading-[1.2] tracking-[-0.02em] text-gray-900 dark:text-white lg:text-4xl"
    >
      {getLocalizedValue(dataset.title)}
      <LanguageBadge values={dataset.title} />
    </h1>

    {#if dataset.publisher?.name}
      <div class="mb-4 flex items-center gap-2 text-[0.9375rem] leading-[1.5]">
        <svg
          class="h-4 w-4 flex-shrink-0 text-gray-600 dark:text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-label={m.dataset_publisher()}
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
          />
        </svg>
        <a
          href={localizeHref(
            `/datasets?publishers=${encodeURIComponent(dataset.publisher.$id || '')}`,
          )}
          class="text-gray-700 hover:underline dark:text-gray-300"
        >
          {getLocalizedValue(dataset.publisher.name)}
        </a>
      </div>
    {/if}

    {#if dataset.description}
      <p
        class="mb-6 text-lg leading-relaxed text-gray-700 dark:text-gray-300 lg:text-xl"
      >
        {getLocalizedValue(dataset.description)}
        <LanguageBadge values={dataset.description} />
      </p>
    {/if}
  </div>

  <!-- Dataset Details Section (compact) -->
  {#if localizedKeywords.length > 0 || dataset.publisher?.name || dataset.license || (dataset.spatial && dataset.spatial.length > 0) || temporalCoverages.length > 0 || localizedAbout.length > 0 || (dataset.language && dataset.language.length > 0)}
    <div class="mb-8">
      <div
        class="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
      >
        <dl class="divide-y divide-gray-200 dark:divide-gray-700">
          <!-- URI -->
          <div
            class="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4"
          >
            <dt
              class="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2"
            >
              <svg
                class="h-5 w-5 text-gray-500 dark:text-gray-400 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                />
              </svg>
              {m.detail_uri()}
              <span id="tooltip-uri" class="cursor-pointer">
                <InfoCircleSolid
                  class="h-4.5 w-4.5 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
                />
              </span>
              <Tooltip triggeredBy="#tooltip-uri"
                >{m.detail_uri_description()}</Tooltip
              >
            </dt>
            <dd class="text-sm flex items-center gap-2">
              <a
                href={dataset.$id}
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-1 break-all text-blue-600 hover:underline dark:text-blue-400"
              >
                {dataset.$id}
                <ArrowUpRightFromSquareOutline class="h-3 w-3 shrink-0" />
                <span class="sr-only"> ({m.opens_in_new_tab()})</span>
              </a>
              <Clipboard value={dataset.$id} class="p-0">
                {#snippet children(success)}
                  <Tooltip
                    >{success ? m.detail_copied() : m.detail_copy()}</Tooltip
                  >
                  {#if success}<CheckOutline
                      class="h-4 w-4 text-gray-500 dark:text-gray-400"
                    />{:else}<ClipboardCleanSolid
                      class="h-4 w-4 text-gray-500 dark:text-gray-400"
                    />{/if}
                {/snippet}
              </Clipboard>
            </dd>
          </div>

          <!-- Publisher -->
          {#if dataset.publisher?.name}
            <div
              class="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4"
            >
              <dt
                class="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2"
              >
                <svg
                  class="h-5 w-5 text-gray-500 dark:text-gray-400 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                  />
                </svg>
                {publisherIsCreator
                  ? m.detail_publisher_and_creator()
                  : m.detail_publisher()}
                <span id="tooltip-publisher" class="cursor-pointer">
                  <InfoCircleSolid
                    class="h-4.5 w-4.5 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
                  />
                </span>
                <Tooltip triggeredBy="#tooltip-publisher"
                  >{m.detail_publisher_description()}</Tooltip
                >
              </dt>
              <dd class="text-sm text-gray-700 dark:text-gray-300">
                <a
                  href={localizeHref(
                    `/datasets?publishers=${encodeURIComponent(dataset.publisher.$id || '')}`,
                  )}
                  class="text-blue-600 hover:underline dark:text-blue-400"
                >
                  {getLocalizedValue(dataset.publisher.name)}
                </a>
                {#if dataset.publisher.nick}
                  <span class="text-gray-500 dark:text-gray-400"
                    >({getLocalizedValue(dataset.publisher.nick)})</span
                  >
                {/if}
                <LanguageBadge values={dataset.publisher.name} />
                {#if dataset.contactPoint?.email || dataset.publisher.sameAs}
                  <div
                    class="mt-1.5 flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400"
                  >
                    {#if dataset.contactPoint?.email}
                      <a
                        href={dataset.contactPoint.email}
                        class="inline-flex items-center gap-1.5 hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        <svg
                          class="h-3.5 w-3.5 flex-shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                          />
                        </svg>
                        <span class="break-all"
                          >{dataset.contactPoint.email.replace(
                            'mailto:',
                            '',
                          )}</span
                        >
                      </a>
                    {/if}
                    {#if dataset.publisher.sameAs}
                      <a
                        href={dataset.publisher.sameAs}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="inline-flex items-center gap-1.5 hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        <svg
                          class="h-3.5 w-3.5 flex-shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                          />
                        </svg>
                        <span class="break-all">{dataset.publisher.sameAs}</span
                        >
                        <span class="sr-only"> ({m.opens_in_new_tab()})</span>
                      </a>
                    {/if}
                  </div>
                {/if}
              </dd>
            </div>
          {/if}

          <!-- Creator (hidden when same as publisher) -->
          {#if dataset.creator && dataset.creator.length > 0 && !publisherIsCreator}
            <div
              class="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4"
            >
              <dt
                class="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2"
              >
                <svg
                  class="h-5 w-5 text-gray-500 dark:text-gray-400 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
                {m.detail_creator()}
              </dt>
              <dd class="text-sm text-gray-700 dark:text-gray-300">
                {#each dataset.creator as creator, index (creator)}
                  <span>
                    <a
                      href={creator.$id}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
                    >
                      {getLocalizedValue(creator.name)}
                      <ArrowUpRightFromSquareOutline class="h-3 w-3 shrink-0" />
                      <span class="sr-only"> ({m.opens_in_new_tab()})</span>
                    </a>
                    <LanguageBadge values={creator.name} />
                  </span>{#if index < dataset.creator.length - 1},&nbsp;{/if}
                {/each}
              </dd>
            </div>
          {/if}

          <!-- Catalog -->
          {#if dataset.isPartOf}
            <div
              class="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4"
            >
              <dt
                class="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2"
              >
                <svg
                  class="h-5 w-5 text-gray-500 dark:text-gray-400 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  />
                </svg>
                {m.detail_is_part_of()}
                <span id="tooltip-is-part-of" class="cursor-pointer">
                  <InfoCircleSolid
                    class="h-4.5 w-4.5 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
                  />
                </span>
                <Tooltip triggeredBy="#tooltip-is-part-of"
                  >{m.detail_is_part_of_description()}</Tooltip
                >
              </dt>
              <dd
                class="text-sm text-gray-700 dark:text-gray-300 flex flex-wrap items-center gap-2"
              >
                {#if dataset.isPartOf.startsWith('http://') || dataset.isPartOf.startsWith('https://')}
                  <a
                    href={dataset.isPartOf}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center gap-1 break-all text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {dataset.isPartOf}
                    <ArrowUpRightFromSquareOutline class="h-3 w-3 shrink-0" />
                    <span class="sr-only"> ({m.opens_in_new_tab()})</span>
                  </a>
                  <a
                    href={localizeHref(
                      `/datasets?catalog=${encodeURIComponent(dataset.isPartOf)}`,
                    )}
                    class="inline-flex items-center gap-1 rounded-full border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    {m.detail_browse_catalog()}
                  </a>
                {:else}
                  {dataset.isPartOf}
                {/if}
              </dd>
            </div>
          {/if}

          <!-- Landing Page -->
          {#if dataset.landingPage}
            <div
              class="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4"
            >
              <dt
                class="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2"
              >
                <ArrowUpRightFromSquareOutline
                  class="h-5 w-5 flex-shrink-0 text-gray-500 dark:text-gray-400"
                />
                {m.detail_landing_page()}
              </dt>
              <dd class="text-sm break-all">
                <a
                  href={dataset.landingPage}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
                  title={dataset.landingPage}
                >
                  {dataset.landingPage}
                  <ArrowUpRightFromSquareOutline class="h-3 w-3 shrink-0" />
                  <span class="sr-only"> ({m.opens_in_new_tab()})</span>
                </a>
              </dd>
            </div>
          {/if}

          <!-- License -->
          {#if dataset.license}
            <div
              class="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4"
            >
              <dt
                class="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2"
              >
                <svg
                  class="h-5 w-5 text-gray-500 dark:text-gray-400 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
                {m.detail_license()}
              </dt>
              <dd class="text-sm break-all">
                <a
                  href={dataset.license}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
                  title={dataset.license}
                >
                  {getLicenseName(dataset.license)}
                  <ArrowUpRightFromSquareOutline class="h-3 w-3 shrink-0" />
                  <span class="sr-only"> ({m.opens_in_new_tab()})</span>
                </a>
              </dd>
            </div>
          {/if}

          <!-- Spatial Coverage -->
          {#if dataset.spatial && dataset.spatial.length > 0}
            <div
              class="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4"
            >
              <dt
                class="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2"
              >
                <svg
                  class="h-5 w-5 text-gray-500 dark:text-gray-400 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                {m.detail_spatial_coverage()}
                <span id="tooltip-spatial" class="cursor-pointer">
                  <InfoCircleSolid
                    class="h-4.5 w-4.5 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
                  />
                </span>
                <Tooltip triggeredBy="#tooltip-spatial"
                  >{m.detail_spatial_coverage_description()}</Tooltip
                >
              </dt>
              <dd class="text-sm text-gray-700 dark:text-gray-300 break-all">
                {#await data.resolvedTerms}
                  {dataset.spatial.join(', ')}
                {:then resolvedTerms}
                  {#each dataset.spatial as spatialValue, index (spatialValue)}
                    {#if index > 0},
                    {/if}
                    {#if resolvedTerms[spatialValue]}
                      <a
                        href={spatialValue}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
                      >
                        {resolvedTerms[spatialValue]}
                        <ArrowUpRightFromSquareOutline
                          class="h-3 w-3 shrink-0"
                        />
                        <span class="sr-only">
                          ({m.opens_in_new_tab()})
                        </span>
                      </a>
                    {:else}
                      {spatialValue}
                    {/if}
                  {/each}
                {/await}
              </dd>
            </div>
          {/if}

          <!-- Temporal Coverage -->
          {#if temporalCoverages.length > 0}
            <div
              class="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4"
            >
              <dt
                class="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2"
              >
                <svg
                  class="h-5 w-5 text-gray-500 dark:text-gray-400 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                {m.detail_temporal_coverage()}
                <span id="tooltip-temporal" class="cursor-pointer">
                  <InfoCircleSolid
                    class="h-4.5 w-4.5 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
                  />
                </span>
                <Tooltip triggeredBy="#tooltip-temporal"
                  >{m.detail_temporal_coverage_description()}</Tooltip
                >
              </dt>
              <dd
                class="text-sm text-gray-700 dark:text-gray-300 break-all space-y-1"
              >
                {#each temporalCoverages as coverage (coverage)}
                  {#if coverage.kind === 'period'}
                    <div>
                      {coverage.start ?? '…'} – {coverage.end ?? '…'}
                    </div>
                  {:else if coverage.kind === 'iri'}
                    {#await data.resolvedTerms}
                      <div>{coverage.iri}</div>
                    {:then resolvedTerms}
                      <div>
                        {#if resolvedTerms[coverage.iri]}
                          <a
                            href={coverage.iri}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
                          >
                            {resolvedTerms[coverage.iri]}
                            <ArrowUpRightFromSquareOutline
                              class="h-3 w-3 shrink-0"
                            />
                            <span class="sr-only">
                              ({m.opens_in_new_tab()})
                            </span>
                          </a>
                        {:else}
                          {coverage.iri}
                        {/if}
                      </div>
                    {/await}
                  {:else}
                    <div>{coverage.value}</div>
                  {/if}
                {/each}
              </dd>
            </div>
          {/if}

          <!-- Language -->
          {#if dataset.language && dataset.language.length > 0}
            <div
              class="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4"
            >
              <dt
                class="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2"
              >
                <svg
                  class="h-5 w-5 text-gray-500 dark:text-gray-400 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
                  />
                </svg>
                {m.dataset_languages()}
                <span id="tooltip-language" class="cursor-pointer">
                  <InfoCircleSolid
                    class="h-4.5 w-4.5 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
                  />
                </span>
                <Tooltip triggeredBy="#tooltip-language"
                  >{m.detail_language_description()}</Tooltip
                >
              </dt>
              <dd class="text-sm text-gray-700 dark:text-gray-300">
                {dataset.language
                  .map((lang: string) => getLanguageLabel(lang))
                  .join(', ')}
              </dd>
            </div>
          {/if}

          <!-- About -->
          {#if localizedAbout.length > 0}
            <div
              class="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4"
            >
              <dt
                class="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2"
              >
                <svg
                  class="h-5 w-5 text-gray-500 dark:text-gray-400 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
                  />
                </svg>
                {m.detail_about()}
              </dt>
              <dd class="text-sm text-gray-700 dark:text-gray-300 break-all">
                {#await data.resolvedTerms}
                  {localizedAbout.join(', ')}
                {:then resolvedTerms}
                  {#each localizedAbout as aboutValue, index (aboutValue)}
                    {#if index > 0},
                    {/if}
                    {#if resolvedTerms[aboutValue]}
                      <a
                        href={aboutValue}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
                      >
                        {resolvedTerms[aboutValue]}
                        <ArrowUpRightFromSquareOutline
                          class="h-3 w-3 shrink-0"
                        />
                        <span class="sr-only">
                          ({m.opens_in_new_tab()})
                        </span>
                      </a>
                    {:else}
                      {aboutValue}
                    {/if}
                  {/each}
                {/await}
              </dd>
            </div>
          {/if}

          <!-- Keywords -->
          {#if localizedKeywords.length > 0}
            <div
              class="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4"
            >
              <dt
                class="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2"
              >
                <svg
                  class="h-5 w-5 text-gray-500 dark:text-gray-400 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                  />
                </svg>
                {m.detail_keywords()}
              </dt>
              <dd class="flex flex-wrap gap-1.5">
                {#each localizedKeywords as keyword (keyword)}
                  <a
                    href={localizeHref(
                      `/datasets?keywords=${encodeURIComponent(keyword)}`,
                    )}
                    class="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 transition-colors hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-200 dark:hover:bg-blue-900/50 no-underline"
                  >
                    {keyword}
                  </a>
                {/each}
              </dd>
            </div>
          {/if}

          <!-- Issued -->
          {#if dataset.issued}
            <div
              class="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4"
            >
              <dt
                class="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2"
              >
                <svg
                  class="h-5 w-5 text-gray-500 dark:text-gray-400 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                {m.detail_issued()}
              </dt>
              <dd class="text-sm text-gray-700 dark:text-gray-300">
                {new Date(dataset.issued).toLocaleDateString(getLocale(), {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </dd>
            </div>
          {/if}

          <!-- Modified -->
          {#if dataset.modified}
            <div
              class="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4"
            >
              <dt
                class="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2"
              >
                <svg
                  class="h-5 w-5 text-gray-500 dark:text-gray-400 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                {m.detail_modified()}
              </dt>
              <dd class="text-sm text-gray-700 dark:text-gray-300">
                {new Date(dataset.modified).toLocaleDateString(getLocale(), {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </dd>
            </div>
          {/if}
        </dl>
      </div>
    </div>
  {/if}

  <!-- Distributions Section -->
  {#if sortedDistributions.length > 0}
    <div class="mb-8">
      <h2
        class="mb-4 flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-white"
      >
        <svg
          class="w-5 h-5 text-gray-600 dark:text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        {m.detail_distributions()}
        <span id="tooltip-distributions" class="cursor-pointer">
          <InfoCircleSolid
            class="h-5 w-5 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
          />
        </span>
        <Tooltip triggeredBy="#tooltip-distributions"
          >{m.detail_distributions_tooltip()}</Tooltip
        >
      </h2>
      <div class="flex flex-wrap gap-3">
        <!-- Query dataset split button -->
        {#if sparqlDistributions.length > 0}
          <div class="inline-flex rounded-lg shadow-sm" role="group">
            {#if preferredEndpoint}
              <a
                href={yasguiUrl(preferredEndpoint.accessURL)}
                target="_blank"
                rel="noopener noreferrer"
                class={splitBtnMainClass}
              >
                <SearchOutline class="me-2 h-4 w-4" />
                {m.detail_query_dataset()}
                <span class="sr-only"> ({m.opens_in_new_tab()})</span>
              </a>
            {:else}
              <span
                id="query-none-available"
                class={splitBtnMainDisabledClass}
                aria-disabled="true"
              >
                <SearchOutline class="me-2 h-4 w-4" />
                {m.detail_query_none_available()}
              </span>
              <Tooltip triggeredBy="#query-none-available"
                >{m.detail_query_none_available_tooltip()}</Tooltip
              >
            {/if}
            <button
              type="button"
              id="btn-query-dropdown"
              aria-label={m.detail_show_query_endpoints()}
              class={splitBtnChevronClass}
            >
              <ChevronDownOutline class="h-4 w-4" />
            </button>
          </div>
          <Dropdown
            simple
            triggeredBy="#btn-query-dropdown"
            class="max-h-96 w-max min-w-72 max-w-[28rem] overflow-y-auto overflow-x-hidden border border-gray-200 shadow-lg dark:border-gray-600"
          >
            {#each sparqlDistributions as distribution, distIndex (distribution.$id)}
              <DropdownItem
                classes={{
                  item: 'flex flex-col items-start gap-1 !whitespace-normal',
                }}
              >
                <div class="flex w-full items-center gap-2">
                  <span
                    class="inline-flex items-center rounded bg-purple-100 px-1.5 py-0.5 text-xs font-medium text-purple-800 dark:bg-purple-900/30 dark:text-purple-300"
                  >
                    SPARQL
                  </span>
                  {@render statusBadge(
                    distribution,
                    `tooltip-sparql-status-${distIndex}`,
                  )}
                  {@render copyButton(distribution.accessURL)}
                </div>
                <a
                  href={yasguiUrl(distribution.accessURL)}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="block max-w-full truncate text-xs text-blue-600 hover:underline dark:text-blue-400"
                  title={distribution.accessURL}
                >
                  {distribution.accessURL}
                  <span class="sr-only"> ({m.opens_in_new_tab()})</span>
                </a>
                {#if distribution.description}
                  <span class="text-xs text-gray-500 dark:text-gray-400">
                    {getLocalizedValue(distribution.description)}
                  </span>
                {/if}
              </DropdownItem>
            {/each}
          </Dropdown>
        {/if}

        <!-- Download dataset split button -->
        {#if downloadDistributions.length > 0}
          <div class="inline-flex rounded-lg shadow-sm" role="group">
            {#if preferredDownload && !preferredDownloadUnusable}
              <a
                href={preferredDownload.accessURL}
                target="_blank"
                rel="noopener noreferrer"
                class={splitBtnMainClass}
              >
                <DownloadOutline class="me-2 h-4 w-4" />
                {m.detail_download_dataset()}
                <span class="sr-only"> ({m.opens_in_new_tab()})</span>
              </a>
            {:else if preferredDownloadUnusable}
              <span
                id="download-not-usable"
                class={splitBtnMainDisabledClass}
                aria-disabled="true"
              >
                <DownloadOutline class="me-2 h-4 w-4" />
                {m.detail_download_not_usable()}
              </span>
              <Tooltip triggeredBy="#download-not-usable"
                >{m.detail_download_not_usable_tooltip()}</Tooltip
              >
            {:else}
              <span
                id="download-none-available"
                class={splitBtnMainDisabledClass}
                aria-disabled="true"
              >
                <DownloadOutline class="me-2 h-4 w-4" />
                {m.detail_download_none_available()}
              </span>
              <Tooltip triggeredBy="#download-none-available"
                >{m.detail_download_none_available_tooltip()}</Tooltip
              >
            {/if}
            <button
              type="button"
              id="btn-download-dropdown"
              aria-label={m.detail_show_download_options()}
              class={splitBtnChevronClass}
            >
              <ChevronDownOutline class="h-4 w-4" />
            </button>
          </div>
          <Dropdown
            simple
            triggeredBy="#btn-download-dropdown"
            class="max-h-96 w-max min-w-72 max-w-[28rem] overflow-y-auto overflow-x-hidden border border-gray-200 shadow-lg dark:border-gray-600"
          >
            {#each rdfDownloads as distribution, distIndex (distribution.$id)}
              {@render downloadDropdownItem(distribution, 'rdf', distIndex)}
            {/each}
            {#if rdfDownloads.length > 0 && otherDownloads.length > 0}
              <DropdownDivider />
            {/if}
            {#each otherDownloads as distribution, distIndex (distribution.$id)}
              {@render downloadDropdownItem(distribution, 'other', distIndex)}
            {/each}
          </Dropdown>
        {/if}
      </div>
      {#if totalDistributions > sortedDistributions.length}
        <p class="mt-3 text-sm text-gray-500 dark:text-gray-400">
          {m.detail_distributions_showing({
            shown: sortedDistributions.length.toString(),
            total: totalDistributions.toString(),
          })}
        </p>
      {/if}
    </div>
  {/if}

  <!-- The Knowledge Graph analysis (NDE-compatibility criteria + the VoID
       linked-data summary) streams in after the register record above; see
       DatasetAnalysis. The shell renders immediately and this section fills in
       once data.analysis resolves. -->
  {#await data.analysis}
    <!-- Skeleton placeholder while the streamed analysis loads, matching the
         search page's shimmer style: a row for the criteria “vinkjes” and a few
         lines for the linked-data summary. The label is screen-reader-only; the
         bars are decorative. -->
    <div class="mb-8" role="status" aria-live="polite">
      <span class="sr-only">{m.detail_analysis_loading()}</span>
      <div class="mb-6 flex flex-wrap gap-3" aria-hidden="true">
        {#each [1, 2, 3, 4] as pill (pill)}
          <div
            class="h-8 w-32 animate-shimmer rounded-full bg-gradient-to-r from-gray-300 to-gray-200 dark:from-gray-700 dark:to-gray-600"
          ></div>
        {/each}
      </div>
      <div
        class="mb-4 h-7 w-2/5 animate-shimmer rounded bg-gradient-to-r from-gray-300 to-gray-200 dark:from-gray-700 dark:to-gray-600"
        aria-hidden="true"
      ></div>
      <div
        class="mb-2.5 h-4 animate-shimmer rounded bg-gradient-to-r from-gray-300 to-gray-200 dark:from-gray-700 dark:to-gray-600"
        aria-hidden="true"
      ></div>
      <div
        class="h-4 w-3/5 animate-shimmer rounded bg-gradient-to-r from-gray-300 to-gray-200 dark:from-gray-700 dark:to-gray-600"
        aria-hidden="true"
      ></div>
    </div>
  {:then analysis}
    {@const summary = analysis.summary}
    {@const summaryGeneratedAt = analysis.summaryGeneratedAt}
    {@const linksets = analysis.linksets}
    {@const iiifManifests = analysis.iiifManifests}
    {@const persistentUris = analysis.persistentUris}
    {@const linkedData = analysis.linkedData}
    {@const terms = analysis.terms}
    {@const hasVoidStats = computeHasVoidStats(summary)}
    {@const classPartitionTable = buildClassPartitionTable(summary)}
    {@const summaryUnavailable = computeSummaryUnavailable(
      summary,
      hasVoidStats,
    )}
    <!-- NDE compatibility (“vinkjes”) -->
    <NdeCompatibility
      isAnalyzed={isAnalyzed(summary)}
      {registrationStatus}
      {registrationHasWarnings}
      {persistentUris}
      {terms}
      {iiifManifests}
      {linkedData}
      validateHref={dataset.subjectOf?.$id
        ? localizeHref(`/validate?url=${encodeUrlParam(dataset.subjectOf.$id)}`)
        : null}
    />

    <!-- VoID Summary Section -->
    {#if summary && hasVoidStats}
      <div class="mb-8">
        <h2
          id="linked-data-summary"
          class="mb-4 flex scroll-mt-20 flex-wrap items-center gap-2 text-xl font-semibold text-gray-900 lg:scroll-mt-24 dark:text-white"
        >
          {m.detail_linked_data_summary()}
          <span id="tooltip-linked-data-summary" class="cursor-pointer">
            <InfoCircleSolid
              class="h-5 w-5 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
            />
          </span>
          <Tooltip triggeredBy="#tooltip-linked-data-summary"
            >{m.detail_linked_data_summary_description()}</Tooltip
          >
          {#if summaryGeneratedAt}
            <span
              id="summary-generated-relative"
              class="ml-auto cursor-default text-sm font-normal text-gray-600 dark:text-gray-400"
            >
              {m.detail_summary_updated({
                time: getRelativeTimeString(new Date(summaryGeneratedAt)),
              })}
            </span>
            <Tooltip triggeredBy="#summary-generated-relative">
              {new Date(summaryGeneratedAt).toLocaleDateString(getLocale(), {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Tooltip>
          {/if}
        </h2>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <!-- Merged: Triples + Subjects + Avg Triples Per Subject -->
          {#if (summary.triples !== undefined && summary.triples !== null) || (summary.distinctSubjects !== undefined && summary.distinctSubjects !== null)}
            <div
              class="rounded-lg border border-gray-200 bg-white p-4 shadow dark:border-gray-700 dark:bg-gray-800"
            >
              <div class="space-y-3">
                {#if summary.distinctSubjects !== undefined && summary.distinctSubjects !== null}
                  <div>
                    <div
                      class="text-3xl font-bold text-gray-900 dark:text-white"
                    >
                      {summary.distinctSubjects.toLocaleString(getLocale())}
                    </div>
                    <div class="text-sm text-gray-600 dark:text-gray-400">
                      {m.detail_subjects()}
                    </div>
                  </div>
                {/if}
                {#if summary.triples !== undefined && summary.triples !== null}
                  <div
                    class="border-t border-gray-200 dark:border-gray-700 pt-3"
                  >
                    <div
                      class="text-3xl font-bold text-gray-900 dark:text-white"
                    >
                      {summary.triples.toLocaleString(getLocale())}
                    </div>
                    <div class="text-sm text-gray-600 dark:text-gray-400">
                      {m.detail_triples()}
                    </div>
                  </div>
                {/if}
                {#if summary.triples !== undefined && summary.triples !== null && summary.distinctSubjects !== undefined && summary.distinctSubjects !== null && summary.distinctSubjects > 0}
                  <div
                    class="border-t border-gray-200 dark:border-gray-700 pt-3"
                  >
                    <div
                      class="text-2xl font-semibold text-blue-700 dark:text-blue-300"
                    >
                      {(
                        summary.triples / summary.distinctSubjects
                      ).toLocaleString(getLocale(), {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })}
                    </div>
                    <div class="text-xs text-gray-600 dark:text-gray-400">
                      {m.detail_avg_triples_per_subject()}
                    </div>
                  </div>
                {/if}
              </div>
            </div>
          {/if}

          {#if summary.properties !== undefined && summary.properties !== null}
            <div
              class="rounded-lg border border-gray-200 bg-white p-4 shadow dark:border-gray-700 dark:bg-gray-800"
            >
              <div class="text-3xl font-bold text-gray-900 dark:text-white">
                {summary.properties.toLocaleString(getLocale())}
              </div>
              <div class="text-sm text-gray-600 dark:text-gray-400">
                {m.detail_properties()}
              </div>
            </div>
          {/if}

          {#if summary.distinctObjectsURI !== undefined || summary.distinctObjectsLiteral !== undefined}
            {@const totalObjects =
              (summary.distinctObjectsURI || 0) +
              (summary.distinctObjectsLiteral || 0)}
            {@const literalsCount = summary.distinctObjectsLiteral || 0}
            {@const urisCount = summary.distinctObjectsURI || 0}
            {@const literalsPercent =
              totalObjects > 0 ? (literalsCount / totalObjects) * 100 : 0}
            {@const urisPercent =
              totalObjects > 0 ? (urisCount / totalObjects) * 100 : 0}
            {#if totalObjects > 0}
              <div
                class="rounded-lg border border-gray-200 bg-white p-4 shadow dark:border-gray-700 dark:bg-gray-800"
              >
                <div class="text-3xl font-bold text-gray-900 dark:text-white">
                  {totalObjects.toLocaleString(getLocale())}
                </div>
                <div class="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  {m.detail_objects()}
                </div>

                <!-- Horizontal bar chart -->
                <div class="mt-4 space-y-3">
                  <div class="flex h-8 overflow-hidden rounded-lg">
                    {#if literalsCount > 0}
                      <div
                        class="flex items-center justify-center bg-blue-500 text-white text-xs font-semibold tabular-nums transition-all"
                        style="width: {literalsPercent}%"
                        title="{m.detail_literals()}: {literalsCount.toLocaleString(
                          getLocale(),
                        )} ({literalsPercent.toLocaleString(getLocale(), {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 1,
                        })}%)"
                      >
                        {#if literalsPercent > 10}
                          {literalsPercent.toLocaleString(getLocale(), {
                            maximumFractionDigits: 0,
                          })}%
                        {/if}
                      </div>
                    {/if}
                    {#if urisCount > 0}
                      <div
                        class="flex items-center justify-center bg-cyan-500 text-white text-xs font-semibold tabular-nums transition-all"
                        style="width: {urisPercent}%"
                        title="{m.detail_uris()}: {urisCount.toLocaleString(
                          getLocale(),
                        )} ({urisPercent.toLocaleString(getLocale(), {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 1,
                        })}%)"
                      >
                        {#if urisPercent > 10}
                          {urisPercent.toLocaleString(getLocale(), {
                            maximumFractionDigits: 0,
                          })}%
                        {/if}
                      </div>
                    {/if}
                  </div>

                  <!-- Legend -->
                  <div class="flex flex-wrap gap-4 text-xs">
                    <div class="flex items-center gap-2">
                      <div class="h-3 w-3 rounded bg-blue-500"></div>
                      <span class="text-gray-700 dark:text-gray-300">
                        {m.detail_literals()}: {literalsCount.toLocaleString(
                          getLocale(),
                        )}
                      </span>
                    </div>
                    <div class="flex items-center gap-2">
                      <div class="h-3 w-3 rounded bg-cyan-500"></div>
                      <span class="text-gray-700 dark:text-gray-300">
                        {m.detail_uris()}: {urisCount.toLocaleString(
                          getLocale(),
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            {/if}
          {/if}
        </div>

        <!-- Classes Section with Property Partitions -->
        {#if classPartitionTable}
          <ClassPropertiesWidget
            {classPartitionTable}
            globalPropertyPartitions={summary.propertyPartition}
          />
        {/if}

        <!-- Vocabularies Section -->
        {#if summary.vocabulary && summary.vocabulary.length > 0}
          <div class="mt-6">
            <h3
              class="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white"
            >
              {m.detail_vocabularies()}
              <span id="tooltip-vocabularies" class="cursor-pointer">
                <InfoCircleSolid
                  class="h-5 w-5 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
                />
              </span>
              <Tooltip triggeredBy="#tooltip-vocabularies"
                >{m.detail_vocabularies_description()}</Tooltip
              >
            </h3>
            <ul class="space-y-2">
              {#each summary.vocabulary as vocab (vocab)}
                <li class="flex items-center gap-2 text-sm">
                  <svg
                    class="w-4 h-4 text-gray-600 dark:text-gray-400 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                    />
                  </svg>
                  <a
                    href={vocab}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-blue-600 hover:underline dark:text-blue-400 break-all"
                  >
                    {vocab}
                    <span class="sr-only"> ({m.opens_in_new_tab()})</span>
                  </a>
                </li>
              {/each}
            </ul>
          </div>
        {/if}

        <!-- Terminology Sources Section -->
        {#if linksets.length > 0}
          <div
            id="terminology-sources"
            class="mt-6 scroll-mt-20 lg:scroll-mt-24"
          >
            <h3
              class="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white"
            >
              {m.detail_terminology_sources()}
              <span id="tooltip-terminology-sources" class="cursor-pointer">
                <InfoCircleSolid
                  class="h-5 w-5 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
                />
              </span>
              <Tooltip triggeredBy="#tooltip-terminology-sources"
                >{m.detail_terminology_sources_description()}</Tooltip
              >
            </h3>
            <ul class="space-y-2">
              {#each linksets as linkset (linkset.$id)}
                {#if linkset.objectsTarget}
                  <li class="flex items-center gap-2 text-sm">
                    <a
                      href={localizeHref(
                        `/datasets?terminologySource=${encodeURIComponent(linkset.objectsTarget.$id)}`,
                      )}
                      class="inline-flex items-center gap-1.5 text-blue-600 hover:underline dark:text-blue-400 break-all"
                    >
                      <SearchOutline class="w-4 h-4 flex-shrink-0" />
                      {linkset.objectsTarget.title
                        ? getLocalizedValue(linkset.objectsTarget.title)
                        : linkset.objectsTarget.$id}
                    </a>
                    {#if linkset.triples !== undefined && linkset.triples !== null}
                      <span class="text-gray-500 dark:text-gray-400">
                        ({linkset.triples.toLocaleString(getLocale())}
                        {m.dataset_triples({ count: linkset.triples })})
                      </span>
                    {/if}
                  </li>
                {/if}
              {/each}
            </ul>
          </div>
        {/if}
      </div>
    {:else if summaryUnavailable}
      <!-- No summary, but the dataset offers RDF that failed: explain why, so the
         absence is not silent (the per-distribution detail is in the list below). -->
      <div class="mb-8">
        <h2
          id="linked-data-summary"
          class="mb-4 flex scroll-mt-20 items-center gap-2 text-xl font-semibold text-gray-900 lg:scroll-mt-24 dark:text-white"
        >
          {m.detail_linked_data_summary()}
        </h2>
        <Alert border color="yellow" class="mb-6">
          {#snippet icon()}
            <ExclamationCircleOutline class="h-5 w-5" />
          {/snippet}
          <p class="font-semibold">
            {summaryUnavailable.invalid
              ? m.detail_summary_unavailable_invalid()
              : m.detail_summary_unavailable_unreachable()}
          </p>
          <p>{summaryUnavailable.reason}</p>
        </Alert>
      </div>
    {/if}
  {/await}

  <!-- Registration Section -->
  <div class="mb-8">
    <h2
      id="registration"
      class="mb-4 scroll-mt-20 text-xl font-semibold text-gray-900 lg:scroll-mt-24 dark:text-white"
    >
      {m.detail_registration()}
    </h2>
    <div
      class="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
    >
      <dl class="divide-y divide-gray-200 dark:divide-gray-700">
        {#if dataset.subjectOf}
          <div
            class="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4"
          >
            <dt
              class="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-1"
            >
              {m.detail_registered_url()}
              <span id="tooltip-registered-url" class="cursor-pointer">
                <InfoCircleSolid
                  class="h-4.5 w-4.5 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
                />
              </span>
              <Tooltip triggeredBy="#tooltip-registered-url"
                >{m.detail_registered_url_description()}</Tooltip
              >
            </dt>
            <dd class="text-sm text-gray-700 dark:text-gray-300">
              <div class="flex flex-wrap items-center gap-2">
                <a
                  href={dataset.subjectOf.$id}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-blue-600 hover:underline dark:text-blue-400 break-all"
                >
                  {dataset.subjectOf.$id}
                  <span class="sr-only"> ({m.opens_in_new_tab()})</span>
                </a>
                <a
                  id="tooltip-registration-status"
                  href={localizeHref(
                    `/validate?url=${encodeUrlParam(dataset.subjectOf.$id)}`,
                  )}
                  class="inline-flex flex-shrink-0 items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium text-white transition-colors {registrationStatus
                    ? 'bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600'
                    : 'bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600'}"
                >
                  <svg
                    class="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  {#if registrationStatus === 'gone'}
                    {m.detail_gone()}
                  {:else if registrationStatus === 'invalid'}
                    {m.detail_invalid()}
                  {:else}
                    {m.detail_valid()}
                  {/if}
                  <span class="sr-only"> ({m.opens_in_new_tab()})</span>
                </a>
                <Tooltip triggeredBy="#tooltip-registration-status"
                  >{m.detail_registration_status_description()}</Tooltip
                >
              </div>
            </dd>
          </div>
        {/if}

        {#if dataset.subjectOf?.datePosted}
          <div
            class="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4"
          >
            <dt
              class="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-1"
            >
              {m.detail_registered()}
              <span id="tooltip-registered" class="cursor-pointer">
                <InfoCircleSolid
                  class="h-4.5 w-4.5 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
                />
              </span>
              <Tooltip triggeredBy="#tooltip-registered"
                >{m.detail_registered_description()}</Tooltip
              >
            </dt>
            <dd class="text-sm text-gray-700 dark:text-gray-300">
              {new Date(dataset.subjectOf.datePosted).toLocaleDateString(
                getLocale(),
                {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                },
              )}
            </dd>
          </div>
        {/if}

        {#if dataset.subjectOf?.dateRead}
          <div
            class="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4"
          >
            <dt
              class="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-1"
            >
              {m.detail_last_crawled()}
              <span id="tooltip-last-crawled" class="cursor-pointer">
                <InfoCircleSolid
                  class="h-4.5 w-4.5 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
                />
              </span>
              <Tooltip triggeredBy="#tooltip-last-crawled"
                >{m.detail_last_crawled_description()}</Tooltip
              >
            </dt>
            <dd class="text-sm text-gray-700 dark:text-gray-300">
              <span id="dateread-relative">
                {getRelativeTimeString(dataset.subjectOf.dateRead)}
              </span>
              <Tooltip triggeredBy="#dateread-relative">
                {new Date(dataset.subjectOf.dateRead).toLocaleDateString(
                  getLocale(),
                  {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  },
                )}
              </Tooltip>
            </dd>
          </div>
        {/if}

        {#if dataset.contentRating?.ratingValue !== undefined}
          <div
            class="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4"
          >
            <dt
              class="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-1"
            >
              {m.detail_quality_rating()}
              <span id="tooltip-quality-rating" class="cursor-pointer">
                <InfoCircleSolid
                  class="h-4.5 w-4.5 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
                />
              </span>
              <Tooltip triggeredBy="#tooltip-quality-rating"
                >{m.detail_quality_rating_description()}</Tooltip
              >
            </dt>
            <dd class="text-sm text-gray-700 dark:text-gray-300">
              <div class="flex items-center gap-3">
                <div class="flex items-center gap-2">
                  <div
                    class="h-2 w-24 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
                  >
                    <div
                      class="h-full rounded-full bg-green-600 dark:bg-green-500 transition-all duration-500"
                      style="width: {dataset.contentRating.ratingValue}%"
                    ></div>
                  </div>
                  <span class="font-semibold text-gray-900 dark:text-white"
                    >{dataset.contentRating.ratingValue}%</span
                  >
                </div>
              </div>
              {#if dataset.contentRating.ratingExplanation}
                <div class="mt-2 flex flex-wrap gap-1.5">
                  {m.missing_properties()}:
                  {#each displayMissingProperties(dataset.contentRating.ratingExplanation) as prop (prop)}
                    <span
                      class="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-400"
                    >
                      {prop}
                    </span>
                  {/each}
                </div>
              {/if}
            </dd>
          </div>
        {/if}
      </dl>
    </div>
  </div>
</div>
