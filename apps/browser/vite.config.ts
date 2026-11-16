import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import { loadEnv, searchForWorkspaceRoot } from 'vite';
import { resolve } from 'node:path';
import { nxReadySignal } from '@nx/vite/plugins/nx-ready-signal.plugin';

export default defineConfig(({ command, mode }) => {
  const source = loadEnv(mode, __dirname, '').LDFORGE_SOURCE;
  const localSource =
    command === 'serve' && source ? resolve(source) : undefined;
  const forgePackages = [
    'core',
    'editor',
    'renderers',
    'prefixes',
    'charts',
    'geo',
    'network',
    'timeline',
    'pivot',
    'tree',
  ];
  return {
    root: __dirname,
    resolve: {
      alias: localSource
        ? [
            {
              find: '@ldforge/editor/styles.css',
              replacement: resolve(
                localSource,
                'packages/editor/src/styles.css',
              ),
            },
            ...['compact', 'extended'].map((variant) => ({
              find: `@ldforge/prefixes/${variant}`,
              replacement: resolve(
                localSource,
                `packages/prefixes/src/${variant}.ts`,
              ),
            })),
            ...forgePackages.map((name) => ({
              find: `@ldforge/${name}`,
              replacement: resolve(
                localSource,
                `packages/${name}/src/index.ts`,
              ),
            })),
          ]
        : [],
      // CodeMirror extensions must share the same state/view instances across repos.
      dedupe: [
        '@codemirror/state',
        '@codemirror/view',
        '@codemirror/language',
        '@codemirror/commands',
        '@codemirror/autocomplete',
        '@codemirror/lint',
        '@lezer/common',
        '@lezer/highlight',
        '@lezer/lr',
      ],
    },
    plugins: [
      tailwindcss(),
      sveltekit({
        // Consult https://svelte.dev/docs/kit/integrations
        // for more information about preprocessors
        preprocess: vitePreprocess(),
        adapter: adapter(),
        // SvelteKit 3 no longer generates the $lib alias.
        alias: { $lib: 'src/lib' },
        prerender: {
          // The /changes page renders changelog entries sourced from commit history;
          // a broken link in one entry shouldn't fail the entire site build.
          handleHttpError: ({ message }) => {
            console.warn(message);
          },
        },
      }),
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
      nxReadySignal(),
    ],
    // Local UI previews can use the public search API without a local index.
    // Proxy through Vite because the public API does not allow CORS preflights.
    server: {
      fs: {
        allow: [
          searchForWorkspaceRoot(__dirname),
          ...(localSource ? [localSource] : []),
        ],
      },
      proxy: {
        '/__preview/graphql': {
          target: 'https://datasetregister.netwerkdigitaalerfgoed.nl',
          changeOrigin: true,
          rewrite: () => '/graphql',
        },
      },
    },
    ssr: {
      // lz-string is a CommonJS module; let Vite bundle it during SSR so its
      // named exports (compressToEncodedURIComponent, …) resolve under Vite 8.
      //
      // adapter-node 6 leaves every production dependency out of the server bundle
      // unless it is listed here. @dataset-register/core is a workspace package
      // that the Docker image does not install, so it has to stay bundled.
      noExternal: ['lz-string', '@dataset-register/core'],
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
      exclude: [
        'flowbite-svelte-icons',
        ...(localSource ? forgePackages.map((name) => `@ldforge/${name}`) : []),
      ],
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
  };
});
