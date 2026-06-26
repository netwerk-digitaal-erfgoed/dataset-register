import { test, expect } from '@playwright/test';

// This spec runs against the real adapter-node production server (`node build`),
// not `vite preview` — see playwright.config.ts. It guards against production
// builds that render via SSR but fail to serve their /_app client assets, so the
// app never hydrates and every client-side feature (search, facets, distribution
// dropdowns) is silently dead. That is exactly what the adapter-node 5.5.5
// regression did (sveltejs/kit#16095): SSR pages looked fine while the browser
// 404'd every /_app/immutable/* chunk.
//
// We prove hydration by exercising a purely client-side interaction with no
// backend dependency: the mobile menu toggle. Its click handler and the
// `{#if mobileMenuOpen}` overlay only work once the client bundle has loaded and
// hydrated, so if hydration is broken this test fails.
test.describe('Production hydration', () => {
  test('mobile menu toggle works, proving the client bundle hydrated', async ({
    page,
  }) => {
    // Narrow viewport so the hamburger (hidden on lg+) is shown. Use a static
    // route: on /datasets the client-side search rewrites the URL after load,
    // which trips the layout's auto-close-on-navigation effect and would close
    // the menu out from under us.
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/validate');

    // SSR renders the menu closed; the toggle button is present immediately.
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible();

    const closeButton = page.getByRole('button', { name: 'Close menu' });

    // The button's accessible name only flips from "Open menu" to "Close menu"
    // when the client-side `onclick` handler runs and toggles state — i.e. only
    // once the app has hydrated. SSR always renders it as "Open menu". Retry the
    // click until hydration wires up the handler: on a healthy build this passes
    // within a moment; on a build whose /_app assets 404 it never hydrates, the
    // click does nothing, and this fails at the timeout.
    await expect(async () => {
      await page.getByRole('button', { name: 'Open menu' }).click();
      await expect(closeButton).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 15000 });
  });
});
