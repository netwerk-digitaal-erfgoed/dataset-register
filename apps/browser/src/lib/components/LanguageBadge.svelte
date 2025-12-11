<script lang="ts">
  import { getLocale } from '$lib/paraglide/runtime';
  import * as m from '$lib/paraglide/messages';

  let { values }: { values: Record<string, string> | undefined } = $props();

  let showPopover = $state(false);
  let badgeElement: HTMLButtonElement | undefined = $state();

  // Determine which language is currently displayed (same logic as getLocalizedValue)
  const displayedLang = $derived.by(() => {
    if (!values) return null;
    const locale = getLocale();
    if (values[locale]) return locale;
    if (values['nl']) return 'nl';
    if (values['en']) return 'en';
    if (values['']) return '';
    return Object.keys(values)[0] || null;
  });

  // Get other available translations (excluding the displayed one)
  const otherTranslations = $derived.by(() => {
    if (!values || !displayedLang) return [];
    return Object.entries(values)
      .filter(([lang, value]) => lang !== displayedLang && value)
      .map(([lang, value]) => ({ lang, value }));
  });

  const hasOtherTranslations = $derived(otherTranslations.length > 0);

  // Format language code for display
  function formatLangCode(lang: string): string {
    if (lang === '') return '?';
    return lang.toUpperCase();
  }

  // Get full language name using existing translation keys
  function getLangName(lang: string): string {
    switch (lang) {
      case 'en':
        return m.lang_en();
      case 'nl':
        return m.lang_nl();
      case '':
        return m.lang_badge_unspecified();
      default:
        return lang.toUpperCase();
    }
  }

  function togglePopover() {
    if (hasOtherTranslations) {
      showPopover = !showPopover;
    }
  }

  function handleClickOutside(event: MouseEvent) {
    if (badgeElement && !badgeElement.contains(event.target as Node)) {
      showPopover = false;
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      showPopover = false;
    }
  }
</script>

<svelte:window onclick={handleClickOutside} onkeydown={handleKeydown} />

{#if displayedLang !== null && (displayedLang !== '' || hasOtherTranslations)}
  <span class="relative inline-flex items-center">
    <button
      bind:this={badgeElement}
      type="button"
      onclick={togglePopover}
      class="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-400 {hasOtherTranslations
        ? 'cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600'
        : 'cursor-default'}"
      aria-expanded={showPopover}
      aria-haspopup={hasOtherTranslations ? 'true' : undefined}
      disabled={!hasOtherTranslations}
    >
      {formatLangCode(displayedLang)}
      {#if hasOtherTranslations}
        <svg
          class="h-3 w-3 transition-transform {showPopover ? 'rotate-180' : ''}"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      {/if}
    </button>

    {#if showPopover && hasOtherTranslations}
      <div
        class="absolute left-0 top-full z-50 mt-2 min-w-64 max-w-sm rounded-lg bg-gray-800 px-3 py-2 text-sm text-white shadow-lg dark:bg-gray-700"
        role="tooltip"
      >
        <!-- Arrow pointing up -->
        <div
          class="absolute bottom-full left-3 h-0 w-0 border-4 border-transparent border-b-gray-800 dark:border-b-gray-700"
        ></div>

        <div class="space-y-2">
          {#each otherTranslations as { lang, value } (lang)}
            <div>
              <div class="text-xs font-medium text-gray-400">
                {m.lang_badge_also_in({ lang: getLangName(lang) })}
              </div>
              <div class="text-white">
                {value}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </span>
{/if}
