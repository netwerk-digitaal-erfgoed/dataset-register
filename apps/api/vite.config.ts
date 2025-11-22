import { defineConfig } from 'vite';

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/apps/api',
  plugins: [],
  test: {
    watch: false,
    globals: true,
    environment: 'node',
    include: ['test/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      enabled: true,
      reporter: ['text'],
      provider: 'v8' as const,
      thresholds: {
        autoUpdate: true,
        lines: 80.26,
        functions: 84.61,
        branches: 80.39,
        statements: 80.26,
      },
    },
  },
}));
