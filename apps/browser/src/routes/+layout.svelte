<script lang="ts">
  import '../app.css';
  import LanguageToggle from '$lib/components/LanguageToggle.svelte';
  import * as m from '$lib/paraglide/messages';
  import { getLocale, localizeHref } from '$lib/paraglide/runtime';
  import { page } from '$app/state';
  import { browser, dev } from '$app/environment';

  let { children, data } = $props();
  const locale = $derived(data?.locale || getLocale());

  // Initialize Matomo (production only)
  let matomoInitialized = false;
  $effect(() => {
    if (browser && !dev && !matomoInitialized) {
      matomoInitialized = true;
      window._paq = window._paq || [];
      window._paq.push(['enableLinkTracking']);
      const u = '//matomo.netwerkdigitaalerfgoed.nl/';
      window._paq.push(['setTrackerUrl', u + 'matomo.php']);
      window._paq.push(['setSiteId', '1']);
      const g = document.createElement('script');
      g.async = true;
      g.src = u + 'matomo.js';
      document.head.appendChild(g);
    }
  });

  // Track page views in Matomo on navigation
  $effect(() => {
    if (browser && !dev && window._paq) {
      window._paq.push(['setCustomUrl', page.url.href]);
      window._paq.push(['trackPageView']);
    }
  });

  // Mobile menu state
  let mobileMenuOpen = $state(false);

  function toggleMobileMenu() {
    mobileMenuOpen = !mobileMenuOpen;
  }

  // Auto-close menu on navigation
  $effect(() => {
    void page.url;
    mobileMenuOpen = false;
  });

  // Close menu on Escape key
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && mobileMenuOpen) {
      mobileMenuOpen = false;
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<svelte:head>
  <link
    href="https://datasetregister.netwerkdigitaalerfgoed.nl/assets/favicon-32x32.png"
    rel="icon"
  />
  <link
    href="https://datasetregister.netwerkdigitaalerfgoed.nl/assets/apple-touch-icon.png"
    rel="apple-touch-icon"
    sizes="180x180"
  />
  <link
    href="https://datasetregister.netwerkdigitaalerfgoed.nl/assets/favicon-32x32.png"
    rel="icon"
    sizes="32x32"
    type="image/png"
  />
  <link
    href="https://datasetregister.netwerkdigitaalerfgoed.nl/assets/favicon-16x16.png"
    rel="icon"
    sizes="16x16"
    type="image/png"
  />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link
    href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap"
    rel="stylesheet"
  />
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-950">
  <header
    class="fixed top-0 left-0 right-0 z-50 h-15 lg:h-20 bg-white dark:bg-gray-900 shadow-sm dark:shadow-gray-800"
  >
    <nav class="h-full px-4 lg:px-12">
      <div class="flex items-center justify-between h-full">
        <!-- Logo -->
        <a
          href="https://datasetregister.netwerkdigitaalerfgoed.nl"
          class="block flex-shrink-0 w-48 lg:w-80 xl:w-96"
        >
          <span class="sr-only">{m.logo_link_label()}</span>
          <svg
            viewBox="0 0 266 38"
            xmlns="http://www.w3.org/2000/svg"
            class="text-gray-900 dark:text-gray-100"
          >
            <defs>
              <style>
                .st0 {
                  fill: currentColor;
                }
              </style>
            </defs>
            <path
              transform="matrix(0.707094, -0.707119, 0.707119, 0.707094, -11.695065, 28.198312)"
              class="st0"
              d="M26.89 22.35h2.61v11.73h-2.61z"
            ></path>
            <path
              transform="matrix(0.707094, -0.707119, 0.707119, 0.707094, -3.999806, 9.619853)"
              class="st0"
              d="M8.31 3.77h2.61V15.5H8.31z"
            ></path>
            <path
              transform="matrix(0.382812, -0.923826, 0.923826, 0.382812, 8.495902, 26.296938)"
              class="st0"
              d="M18.06 5.49h11.73V8.1H18.06z"
            ></path>
            <path
              transform="matrix(0.382812, -0.923826, 0.923826, 0.382812, -20.135798, 31.990094)"
              class="st0"
              d="M8.01 29.76h11.73v2.61H8.01z"
            ></path>
            <path
              class="st0"
              d="M17.6 26.2h2.61v11.73H17.6zM17.6-.08h2.61v11.73H17.6z"
            ></path>
            <path
              transform="matrix(0.92388, -0.382683, 0.382683, 0.92388, -10.065885, 11.521379)"
              class="st0"
              d="M22.62 25.2h2.61v11.73h-2.61z"
            ></path>
            <path
              transform="matrix(0.92388, -0.382683, 0.382683, 0.92388, -1.542401, 5.825825)"
              class="st0"
              d="M12.57.92h2.61v11.73h-2.61z"
            ></path>
            <path
              transform="matrix(0.382683, -0.92388, 0.92388, 0.382683, -8.666396, 14.829821)"
              class="st0"
              d="M5.46 8.03h2.61v11.73H5.46z"
            ></path>
            <path
              transform="matrix(0.92388, -0.382683, 0.382683, 0.92388, -2.956749, 12.935421)"
              class="st0"
              d="M25.17 12.6H36.9v2.61H25.17z"
            ></path>
            <path
              transform="matrix(0.92388, -0.382683, 0.382683, 0.92388, -8.651537, 4.411784)"
              class="st0"
              d="M.9 22.65h11.73v2.61H.9z"
            ></path>
            <path
              transform="matrix(0.707094, -0.707119, 0.707119, 0.707094, 1.4415, 22.756004)"
              class="st0"
              d="M22.32 8.33h11.73v2.61H22.32z"
            ></path>
            <path
              transform="matrix(0.707094, -0.707119, 0.707119, 0.707094, -17.136665, 15.061452)"
              class="st0"
              d="M3.75 26.91h11.73v2.61H3.75z"
            ></path>
            <text
              class="st0"
              style="font-family: Poppins,Helvetica,Arial,sans-serif;font-size: 27px; font-weight:400;"
              x="41"
              y="26">datasetregister</text
            >
            <rect
              x="-0.039"
              y="17.751"
              width="43.395"
              height="2.414"
              class="st0"
            ></rect>
          </svg>
        </a>

        <!-- Hamburger Menu Button (Mobile Only) -->
        <button
          class="block lg:hidden select-none flex items-center gap-2 cursor-pointer"
          onclick={toggleMobileMenu}
          aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
        >
          <span class="text-sm text-gray-900 dark:text-gray-100"
            >{mobileMenuOpen ? 'Close' : ''}</span
          >
          <div class="flex flex-col gap-1.5 w-6">
            <div
              class={`bar h-0.5 bg-gray-900 dark:bg-gray-100 transition-all duration-300 ${mobileMenuOpen ? 'rotate-45 translate-y-2' : ''}`}
            ></div>
            <div
              class={`bar h-0.5 bg-gray-900 dark:bg-gray-100 transition-all duration-300 ${mobileMenuOpen ? 'opacity-0' : ''}`}
            ></div>
            <div
              class={`bar h-0.5 bg-gray-900 dark:bg-gray-100 transition-all duration-300 ${mobileMenuOpen ? '-rotate-45 -translate-y-2' : ''}`}
            ></div>
          </div>
        </button>

        <!-- Desktop Navigation Menu -->
        <ul class="hidden lg:flex items-center p-0 m-0 list-none gap-1">
          <li>
            <a
              href={`https://datasetregister.netwerkdigitaalerfgoed.nl/maak.php?lang=${locale}`}
              rel="external"
              class="text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 px-4 py-2 text-base font-normal no-underline inline-block transition-colors"
            >
              {m.nav_create()}
            </a>
          </li>
          <li>
            <a
              href={`https://datasetregister.netwerkdigitaalerfgoed.nl/validate.php?lang=${locale}`}
              rel="external"
              class="text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 px-4 py-2 text-base font-normal no-underline inline-block transition-colors"
            >
              {m.nav_validate()}
            </a>
          </li>
          <li>
            <a
              href={`https://datasetregister.netwerkdigitaalerfgoed.nl/viaurl.php?lang=${locale}`}
              rel="external"
              class="text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 px-4 py-2 text-base font-normal no-underline inline-block transition-colors"
            >
              {m.nav_submit()}
            </a>
          </li>
          <li>
            <a
              href={localizeHref('/datasets')}
              class="text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 px-4 py-2 text-base font-normal no-underline inline-block transition-colors"
            >
              {m.nav_search()}
            </a>
          </li>
          <li>
            <a
              href={`https://datasetregister.netwerkdigitaalerfgoed.nl/faq.php?lang=${locale}`}
              rel="external"
              class="text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 px-4 py-2 text-base font-normal no-underline inline-block transition-colors"
            >
              {m.nav_faq()}
            </a>
          </li>
          <li>
            <LanguageToggle />
          </li>
        </ul>
      </div>
    </nav>

    <!-- Mobile Navigation Menu Overlay -->
    {#if mobileMenuOpen}
      <div
        class="block lg:hidden fixed left-0 right-0 top-15 bottom-0 z-40 bg-white dark:bg-gray-900 overflow-y-auto"
      >
        <div class="flex flex-col p-6 space-y-6">
          <a
            href={`https://datasetregister.netwerkdigitaalerfgoed.nl/?lang=${locale}`}
            rel="external"
            class="text-gray-900 dark:text-gray-100 text-lg font-normal block py-3 no-underline"
          >
            Home
          </a>
          <a
            href={`https://datasetregister.netwerkdigitaalerfgoed.nl/maak.php?lang=${locale}`}
            rel="external"
            class="text-gray-900 dark:text-gray-100 text-lg font-normal block py-3 no-underline"
          >
            {m.nav_create()}
          </a>
          <a
            href={`https://datasetregister.netwerkdigitaalerfgoed.nl/validate.php?lang=${locale}`}
            rel="external"
            class="text-gray-900 dark:text-gray-100 text-lg font-normal block py-3 no-underline"
          >
            {m.nav_validate()}
          </a>
          <a
            href={`https://datasetregister.netwerkdigitaalerfgoed.nl/viaurl.php?lang=${locale}`}
            rel="external"
            class="text-gray-900 dark:text-gray-100 text-lg font-normal block py-3 no-underline"
          >
            {m.nav_submit()}
          </a>
          <a
            href={localizeHref('/datasets')}
            class="text-gray-900 dark:text-gray-100 text-lg font-normal block py-3 no-underline"
          >
            {m.nav_search()}
          </a>
          <a
            href={`https://datasetregister.netwerkdigitaalerfgoed.nl/faq.php?lang=${locale}`}
            rel="external"
            class="text-gray-900 dark:text-gray-100 text-lg font-normal block py-3 no-underline"
          >
            {m.nav_faq()}
          </a>
          <div class="pt-4 border-t border-gray-200 dark:border-gray-700">
            <LanguageToggle />
          </div>
        </div>
      </div>
    {/if}
  </header>

  <main class="container mx-auto px-4 py-8 pt-20 lg:pt-24">
    {@render children()}
  </main>
</div>
