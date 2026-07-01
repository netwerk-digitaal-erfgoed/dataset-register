import tailwindcss from '@tailwindcss/vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
  root: __dirname,
  plugins: [
    tailwindcss(),
    sveltekit(),
    paraglideVitePlugin({
      project: './project.inlang',
      // URL-only locale: the prefix (/en/…) or its absence (base locale nl)
      // fully determines the language. No cookie strategy, so a bare URL renders
      // one deterministic locale — the single source of truth. This keeps links
      // shareable/cacheable per URL and avoids the ambiguity where a cookie could
      // make the same URL render either language. Language switching stays
      // URL-based (see LanguageToggle), and internal links carry the locale via
      // localizeHref, so the choice persists through navigation.
      strategy: ['url', 'baseLocale'],
      outdir: './src/lib/paraglide',
    }),
  ],
  ssr: {
    // lz-string is a CommonJS module; let Vite bundle it during SSR so its
    // named exports (compressToEncodedURIComponent, …) resolve under Vite 8.
    noExternal: ['lz-string'],
  },
  optimizeDeps: {
    // flowbite-svelte-icons exposes each icon as a deep .svelte subpath whose
    // export only declares a `svelte` condition. Vite 8’s Rolldown dependency
    // scanner doesn’t apply that condition, so it failed to resolve the imports
    // (“Package subpath is not defined by exports”), aborted the scan, and
    // skipped pre-bundling for every dependency. Excluding the package keeps
    // its .svelte components out of the scan (they can’t be pre-bundled anyway);
    // teaching the scanner the `svelte` condition lets it resolve the imports it
    // still walks past.
    exclude: ['flowbite-svelte-icons'],
    esbuildOptions: {
      conditions: ['svelte', 'browser'],
    },
  },
  test: {
    passWithNoTests: true,
    expect: { requireAssertions: true },
    projects: [
      {
        extends: './vite.config.ts',
        test: {
          name: 'server',
          environment: 'node',
          include: ['src/**/*.{test,spec}.{js,ts}'],
          exclude: ['src/**/*.svelte.{test,spec}.{js,ts}'],
        },
      },
    ],
  },
});
