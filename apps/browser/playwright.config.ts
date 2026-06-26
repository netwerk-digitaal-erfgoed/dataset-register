import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

// In CI we run two servers so we test what we actually ship:
//   - `vite preview` (port 4173) backs the accessibility specs;
//   - `node build` (port 4174) is the real adapter-node production server and
//     backs e2e/hydration.spec.ts. `vite preview` serves /_app assets through
//     Vite, so it would NOT catch a broken production build (e.g. the
//     adapter-node 5.5.5 regression that 404'd every /_app asset and left the
//     app un-hydrated — sveltejs/kit#16095). Only `node build` exercises that path.
// Locally a single dev server backs both projects.
const previewURL = 'http://localhost:4173';
const productionURL = 'http://localhost:4174';
const devURL = 'http://localhost:5173';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: isCI ? 'github' : 'html',
  timeout: isCI ? 60000 : 30000,
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: '**/hydration.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: isCI ? previewURL : devURL,
      },
    },
    {
      name: 'production',
      testMatch: '**/hydration.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: isCI ? productionURL : devURL,
      },
    },
  ],
  webServer: isCI
    ? [
        {
          command: 'npm run preview',
          url: `${previewURL}/datasets`,
          reuseExistingServer: false,
          timeout: 120000,
        },
        {
          command: 'PORT=4174 node build',
          url: `${productionURL}/datasets`,
          reuseExistingServer: false,
          timeout: 120000,
        },
      ]
    : [
        {
          command: 'npm run dev',
          url: `${devURL}/datasets`,
          reuseExistingServer: true,
          timeout: 120000,
        },
      ],
});
