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
  class="no-underline"
  data-sveltekit-preload-data="off"
  href={url}
  style="color: rgb(23, 42, 89); font-size: 16.1px; font-weight: 400; padding: 38px 18px; display: inline-block; line-height: 24px; font-family: Poppins, Helvetica, Arial, sans-serif;"
>
  {#if currentLocale === 'nl'}
    <strong>NL</strong> • EN
  {:else}
    NL • <strong>EN</strong>
  {/if}
</a>
