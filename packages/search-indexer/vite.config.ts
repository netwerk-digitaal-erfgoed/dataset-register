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
      // Measure the tested logic only. The container test helpers
      // (test/*-container.ts) have environment-variable branch coverage that
      // drifts between local and CI and corrupts the autoUpdate thresholds; the
      // CLI bootstrap (main.ts/config.ts) is wired to real endpoints and is not
      // unit-tested.
      include: ['src/**/*.ts'],
      exclude: ['src/main.ts', 'src/config.ts'],
      // Fixed floors, not autoUpdate: container-integration coverage varies with
      // the environment, so a ratcheted local high-water mark (~89.8% branches,
      // ~98% lines) leaves no margin and breaks CI. These sit safely below the
      // tested-logic actuals.
      thresholds: {
        autoUpdate: false,
        lines: 96,
        functions: 95,
        branches: 87,
        statements: 96,
      },
    },
  },
}));
