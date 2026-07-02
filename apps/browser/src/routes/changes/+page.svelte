<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import type { PageData } from './$types';

  const { data }: { data: PageData } = $props();

  const sectionTitles = {
    changes_section_browser: m.changes_section_browser,
    changes_section_data: m.changes_section_data,
  };
</script>

<svelte:head>
  <title>{m.changes_page_title()}</title>
</svelte:head>

<div class="mx-auto max-w-7xl space-y-6 px-1 sm:px-6 lg:px-8">
  <div class="space-y-6">
    <header class="mb-2">
      <h1
        class="mb-4 text-3xl font-bold leading-[1.2] tracking-[-0.02em] text-gray-900 dark:text-white lg:text-4xl"
      >
        {m.changes_page_title()}
      </h1>
      <p
        class="text-lg leading-relaxed text-gray-700 dark:text-gray-300 lg:text-xl"
      >
        {m.changes_page_intro()}
      </p>
    </header>

    {#if data.sections.length === 0}
      <p class="text-gray-700 dark:text-gray-300">{m.changes_empty()}</p>
    {:else}
      {#each data.sections as section (section.titleKey)}
        <section class="space-y-2">
          <h2
            class="text-xl font-bold text-gray-900 dark:text-white lg:text-2xl"
          >
            {sectionTitles[section.titleKey]()}
          </h2>
          <div class="prose dark:prose-invert max-w-none">
            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
            {@html section.html}
          </div>
        </section>
      {/each}
    {/if}
  </div>
</div>
