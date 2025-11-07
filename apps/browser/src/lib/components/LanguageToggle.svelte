<script lang="ts">
  import { getLocale, localizeHref } from '$lib/paraglide/runtime';
  import { page } from '$app/state';

  const currentLocale = $derived(getLocale());
  const otherLocale = $derived(currentLocale === 'nl' ? 'en' : 'nl');
  const url = $derived(
    localizeHref(page.url.toString(), { locale: otherLocale }),
  );
</script>

<a
  class="text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 px-4 py-2 text-base font-normal no-underline inline-block transition-colors"
  data-sveltekit-preload-data="off"
  href={url}
>
  {#if currentLocale === 'nl'}
    <strong>NL</strong> • EN
  {:else}
    NL • <strong>EN</strong>
  {/if}
</a>
