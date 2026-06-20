import { defineConfig } from 'vite';

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/packages/search-indexer',
  plugins: [],
  test: {
    watch: false,
    globals: true,
    environment: 'node',
    // Acceptance tests start QLever + Typesense containers.
    testTimeout: 120_000,
    hookTimeout: 180_000,
    include: ['test/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      enabled: true,
      reporter: ['text'],
      provider: 'v8' as const,
      thresholds: {
        autoUpdate: true,
        lines: 95.4,
        functions: 100,
        branches: 90.1,
        statements: 95.48,
      },
    },
  },
}));
