import { test as base, expect } from '@playwright/test';

// Playwright's page.goto() and waitForLoadState('load') wait for the `load`
// event, which only fires once every subresource settles. The app's shared
// layout links external resources from its <head> — the Google Fonts stylesheet
// plus its font files, and the remote favicons on datasetregister.netwerk‐
// digitaalerfgoed.nl. CI egress to those hosts is intermittently slow, so `load`
// could take longer than the 60s test timeout and fail with “page.goto: Test
// timeout exceeded”, even though the page itself is fully rendered. That was the
// sole cause of the flaky e2e failures.
//
// Abort every external (non-localhost) HTTP(S) request up front so the suite is
// hermetic and never waits on a third-party host. Aborted requests resolve
// immediately as failed, so `load` fires promptly. Per-test SPARQL mocks are
// registered later (in a beforeEach) and take precedence over this catch-all, so
// they keep working.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route('**/*', (route) => {
      const url = new URL(route.request().url());
      const isLocal =
        url.hostname === 'localhost' || url.hostname === '127.0.0.1';
      const isHttp = url.protocol === 'http:' || url.protocol === 'https:';
      if (!isLocal && isHttp) {
        return route.abort();
      }
      return route.continue();
    });
    await use(page);
  },
});

export { expect };
