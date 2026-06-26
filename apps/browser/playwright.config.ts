import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

// In CI we run the whole suite against the real adapter-node production server
// (`node build`) — the same artifact we ship in the Docker image — so a broken
// production build (e.g. the adapter-node 5.5.5 regression that 404'd every
// /_app asset and left the app un-hydrated, sveltejs/kit#16095) is caught.
// `vite preview` serves /_app through Vite and would mask that, so we don't use
// it. Locally we use the dev server for fast iteration; the production build path
// is exercised in CI (and by the docker:smoke gate against the actual image).
const ciURL = 'http://localhost:4173';
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
    baseURL: isCI ? ciURL : devURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: isCI ? 'PORT=4173 node build' : 'npm run dev',
    url: `${isCI ? ciURL : devURL}/datasets`,
    reuseExistingServer: !isCI,
    timeout: 120000,
  },
});
