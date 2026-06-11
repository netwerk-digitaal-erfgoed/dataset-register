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
      strategy: ['url', 'cookie', 'baseLocale'],
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
