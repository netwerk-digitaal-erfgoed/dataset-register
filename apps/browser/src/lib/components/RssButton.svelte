<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { page } from '$app/state';

  // Generate RSS feed URL with current search parameters
  const rssUrl = $derived(`/datasets/rss${page.url.search}`);
</script>

<a
  href={rssUrl}
  target="_blank"
  rel="noopener noreferrer"
  class="group relative inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 border border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
>
  <div
    class="invisible absolute bottom-full left-1/2 mb-2 -translate-x-1/2 transform rounded bg-gray-800 px-2 py-1 text-xs whitespace-nowrap text-white opacity-0 transition-opacity duration-200 group-hover:visible group-hover:opacity-100"
  >
    {m.rss_subscribe()}
    <div
      class="absolute top-full left-1/2 h-0 w-0 -translate-x-1/2 border-t-4 border-r-4 border-l-4 border-t-gray-800 border-r-transparent border-l-transparent"
    ></div>
  </div>
  RSS
  <svg
    class="w-3 h-3"
    fill="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M6.503 20.752c0 1.794-1.456 3.248-3.251 3.248-1.796 0-3.252-1.454-3.252-3.248 0-1.794 1.456-3.248 3.252-3.248 1.795.001 3.251 1.454 3.251 3.248zm-6.503-12.572v4.811c6.05.062 10.96 4.966 11.022 11.009h4.817c-.062-8.71-7.118-15.758-15.839-15.82zm0-3.368c10.58.046 19.152 8.594 19.183 19.188h4.817c-.03-13.231-10.755-23.954-24-24v4.812z"
    />
  </svg>
</a>
