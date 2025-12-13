<script lang="ts">
  import { getLocale } from '$lib/paraglide/runtime';
  import { localizeHref } from '$lib/utils/i18n';
  import { page } from '$app/state';
  import { isDatasetPathWithUri } from '$lib/utils/dataset-uri';

  const currentLocale = $derived(getLocale());
  const otherLocale = $derived(currentLocale === 'nl' ? 'en' : 'nl');

  // Check if we're on a dataset detail page with a URI.
  // data-sveltekit-reload forces full page navigation, bypassing client-side Paraglide.
  const isDatasetPage = $derived(isDatasetPathWithUri(page.url.pathname));

  const url = $derived(
    localizeHref(page.url.toString(), { locale: otherLocale }),
  );
</script>

<a
  class="text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 px-4 py-2 text-base font-normal no-underline inline-block transition-colors"
  data-sveltekit-preload-data="off"
  data-sveltekit-reload={isDatasetPage ? '' : undefined}
  href={url}
>
  {#if currentLocale === 'nl'}
    <strong>NL</strong> • EN
  {:else}
    NL • <strong>EN</strong>
  {/if}
</a>
