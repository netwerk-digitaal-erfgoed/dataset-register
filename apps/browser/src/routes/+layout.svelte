<script lang="ts">
  import '../app.css';
  import LanguageToggle from '$lib/components/LanguageToggle.svelte';
  import * as m from '$lib/paraglide/messages';
  import { getLocale } from '$lib/paraglide/runtime';

  let { children, data } = $props();
  const locale = $derived(data?.locale || getLocale());
</script>

<svelte:head>
  <link href="/favicon-32x32.png" rel="icon" />
  <link href="/apple-touch-icon.png" rel="apple-touch-icon" sizes="180x180" />
  <link href="/favicon-32x32.png" rel="icon" type="image/png" sizes="32x32" />
  <link href="/favicon-16x16.png" rel="icon" type="image/png" sizes="16x16" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link
    href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap"
    rel="stylesheet"
  />
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-950">
  <header
    style="position: absolute; top: 0px; left: 0px; right: 0px; width: 100%; height: 98px; background-color: rgb(255, 255, 255); box-shadow: rgba(23, 42, 89, 0.05) 0px 2px 7px 0px; z-index: 5; padding: 0px; margin: 0px;"
  >
    <div style="padding: 0px 48.3px;">
      <nav
        style="position: absolute; top: 0px; left: 0px; right: 0px; padding: 0px 48.3px; height: 100.148px;"
      >
        <div
          style="display: flex; height: 100.148px; align-items: center; justify-content: space-between; position: relative;"
        >
          <!-- Logo -->
          <a
            href="https://datasetregister.netwerkdigitaalerfgoed.nl"
            style="width: 400px; margin-top: 12px; position: relative; display: block; flex-shrink: 0;"
          >
            <svg
              viewBox="0 0 266 38"
              xmlns="http://www.w3.org/2000/svg"
              style="color: rgb(23, 42, 89);"
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

          <!-- Navigation Menu -->
          <ul
            style="display: flex; align-items: center; padding: 0; margin: 0; list-style: none; font-family: Poppins, Helvetica, Arial, sans-serif;"
          >
            <li>
              <a
                href={`https://datasetregister.netwerkdigitaalerfgoed.nl/maak.php?lang=${locale}`}
                rel="external"
                class="no-underline"
                style="color: rgb(23, 42, 89); font-size: 16.1px; font-weight: 400; padding: 38px 18px; display: inline-block; line-height: 24px;"
              >
                {m['nav.create']()}
              </a>
            </li>
            <li>
              <a
                href={`https://datasetregister.netwerkdigitaalerfgoed.nl/validate.php?lang=${locale}`}
                rel="external"
                class="no-underline"
                style="color: rgb(23, 42, 89); font-size: 16.1px; font-weight: 400; padding: 38px 18px; display: inline-block; line-height: 24px;"
              >
                {m['nav.validate']()}
              </a>
            </li>
            <li>
              <a
                href={`https://datasetregister.netwerkdigitaalerfgoed.nl/viaurl.php?lang=${locale}`}
                rel="external"
                class="no-underline"
                style="color: rgb(23, 42, 89); font-size: 16.1px; font-weight: 400; padding: 38px 18px; display: inline-block; line-height: 24px;"
              >
                {m['nav.submit']()}
              </a>
            </li>
            <li>
              <a
                href="/datasets"
                rel="external"
                class="no-underline"
                style="color: rgb(23, 42, 89); font-size: 16.1px; font-weight: 400; padding: 38px 18px; display: inline-block; line-height: 24px;"
              >
                {m['nav.search']()}
              </a>
            </li>
            <li>
              <a
                href={`https://datasetregister.netwerkdigitaalerfgoed.nl/faq.php?lang=${locale}`}
                rel="external"
                class="no-underline"
                style="color: rgb(23, 42, 89); font-size: 16.1px; font-weight: 400; padding: 38px 18px; display: inline-block; line-height: 24px;"
              >
                {m['nav.faq']()}
              </a>
            </li>
            <li>
              <LanguageToggle />
            </li>
          </ul>
        </div>
      </nav>
    </div>
  </header>

  <main class="container mx-auto px-4 py-8" style="padding-top: 130px;">
    {@render children()}
  </main>
</div>
