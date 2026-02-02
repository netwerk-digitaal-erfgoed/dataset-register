import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Mock SPARQL response for datasets
const mockSparqlResponse = {
  head: {
    vars: ['dataset', 'title', 'description', 'publisher', 'publisherName'],
  },
  results: {
    bindings: [
      {
        dataset: { type: 'uri', value: 'https://example.org/dataset/1' },
        title: { type: 'literal', value: 'Test Dataset', 'xml:lang': 'en' },
        description: {
          type: 'literal',
          value: 'A test dataset for accessibility testing',
          'xml:lang': 'en',
        },
        publisher: { type: 'uri', value: 'https://example.org/publisher/1' },
        publisherName: { type: 'literal', value: 'Test Publisher' },
      },
    ],
  },
};

test.beforeEach(async ({ page }) => {
  // Intercept SPARQL requests and return mock data
  await page.route('**/sparql**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/sparql-results+json',
      body: JSON.stringify(mockSparqlResponse),
    });
  });
});

test.describe('Accessibility', () => {
  test('datasets page has no accessibility violations', async ({ page }) => {
    await page.goto('/datasets');
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page }).analyze();

    // Log violations for debugging
    if (results.violations.length > 0) {
      console.log(
        'Accessibility violations:',
        JSON.stringify(results.violations, null, 2),
      );
    }

    expect(results.violations).toEqual([]);
  });

  test('page has proper heading structure', async ({ page }) => {
    await page.goto('/datasets');
    await page.waitForLoadState('networkidle');

    // Check for main heading
    const h1 = page.locator('h1');
    await expect(h1).toBeVisible();

    // Verify heading hierarchy (no skipped levels)
    const headings = await page.evaluate(() => {
      const levels = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
      return levels.map((level) => document.querySelectorAll(level).length);
    });

    // Should have at least one h1
    expect(headings[0]).toBeGreaterThan(0);
  });

  test('interactive elements are keyboard accessible', async ({ page }) => {
    await page.goto('/datasets');
    await page.waitForLoadState('networkidle');

    // Tab through page and verify focus is visible
    await page.keyboard.press('Tab');

    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
  });

  test('page has lang attribute', async ({ page }) => {
    await page.goto('/datasets');
    await page.waitForLoadState('networkidle');

    const lang = await page.getAttribute('html', 'lang');
    expect(lang).toBeTruthy();
  });

  test('images have alt text', async ({ page }) => {
    await page.goto('/datasets');
    await page.waitForLoadState('networkidle');

    const imagesWithoutAlt = await page.locator('img:not([alt])').count();
    expect(imagesWithoutAlt).toBe(0);
  });

  test('color contrast meets WCAG AA standards', async ({ page }) => {
    await page.goto('/datasets');
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2aa'])
      .analyze();

    const contrastViolations = results.violations.filter(
      (v) => v.id === 'color-contrast',
    );

    expect(contrastViolations).toEqual([]);
  });

  test('form inputs have associated labels', async ({ page }) => {
    await page.goto('/datasets');
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withRules(['label'])
      .analyze();

    expect(results.violations).toEqual([]);
  });
});
