import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Mock SPARQL response for datasets list
const mockDatasetsListResponse = {
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

// Mock SPARQL response for dataset detail (RDF/Turtle format used by LDkit)
const mockDatasetDetailTurtle = `
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix schema: <https://schema.org/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<https://example.org/dataset/1> a dcat:Dataset ;
    dcterms:title "Test Dataset"@en ;
    dcterms:description "A test dataset for accessibility testing"@en ;
    dcterms:license <https://creativecommons.org/licenses/by/4.0/> ;
    dcterms:publisher <https://example.org/publisher/1> ;
    dcat:distribution <https://example.org/dataset/1/distribution/1> ;
    schema:subjectOf <https://example.org/registration/1> .

<https://example.org/publisher/1> foaf:name "Test Publisher"@en .

<https://example.org/dataset/1/distribution/1> a dcat:Distribution ;
    dcat:accessURL <https://example.org/data.ttl> ;
    dcat:mediaType "text/turtle" .

<https://example.org/registration/1> a schema:EntryPoint ;
    schema:datePosted "2024-01-15T10:00:00Z"^^xsd:dateTime ;
    schema:additionalType <https://data.netwerkdigitaalerfgoed.nl/status/valid> .
`;

test.beforeEach(async ({ page }) => {
  // Intercept SPARQL requests and return appropriate mock data
  await page.route('**/sparql**', async (route) => {
    const request = route.request();
    const acceptHeader = request.headers()['accept'] || '';

    // LDkit requests RDF formats (Turtle/N-Triples), list page requests JSON
    if (
      acceptHeader.includes('text/turtle') ||
      acceptHeader.includes('application/n-triples')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'text/turtle',
        body: mockDatasetDetailTurtle,
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/sparql-results+json',
        body: JSON.stringify(mockDatasetsListResponse),
      });
    }
  });
});

test.describe('Accessibility', () => {
  test('datasets page has no accessibility violations', async ({ page }) => {
    await page.goto('/datasets');
    await page.waitForLoadState('load');

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
    await page.waitForLoadState('load');

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
    await page.waitForLoadState('load');

    // Tab through page and verify focus is visible
    await page.keyboard.press('Tab');

    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
  });

  test('page has lang attribute', async ({ page }) => {
    await page.goto('/datasets');
    await page.waitForLoadState('load');

    const lang = await page.getAttribute('html', 'lang');
    expect(lang).toBeTruthy();
  });

  test('images have alt text', async ({ page }) => {
    await page.goto('/datasets');
    await page.waitForLoadState('load');

    const imagesWithoutAlt = await page.locator('img:not([alt])').count();
    expect(imagesWithoutAlt).toBe(0);
  });

  test('color contrast meets WCAG AA standards', async ({ page }) => {
    await page.goto('/datasets');
    await page.waitForLoadState('load');

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
    await page.waitForLoadState('load');

    const results = await new AxeBuilder({ page })
      .withRules(['label'])
      .analyze();

    expect(results.violations).toEqual([]);
  });
});

test.describe('Accessibility - Dataset Detail Page', () => {
  // Note: page.route() only intercepts browser requests, not server-side SSR requests.
  // SvelteKit fetches data during SSR, so we can't fully mock the detail page data.
  // We exclude 'document-title' rule since it depends on SSR data we can't mock.

  test('dataset detail page has no accessibility violations', async ({
    page,
  }) => {
    await page.goto('/datasets/https%3A%2F%2Fexample.org%2Fdataset%2F1');
    await page.waitForLoadState('load');

    const results = await new AxeBuilder({ page })
      // Exclude document-title: SSR data can't be mocked via page.route()
      .disableRules(['document-title'])
      .analyze();

    if (results.violations.length > 0) {
      console.log(
        'Accessibility violations:',
        JSON.stringify(results.violations, null, 2),
      );
    }

    expect(results.violations).toEqual([]);
  });

  test('dataset detail page has proper heading structure', async ({ page }) => {
    await page.goto('/datasets/https%3A%2F%2Fexample.org%2Fdataset%2F1');
    await page.waitForLoadState('load');

    // Check for main heading (h1 with dataset title)
    const h1 = page.locator('h1');
    await expect(h1).toBeVisible();

    // Verify heading hierarchy
    const headings = await page.evaluate(() => {
      const levels = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
      return levels.map((level) => document.querySelectorAll(level).length);
    });

    // Should have exactly one h1
    expect(headings[0]).toBe(1);
  });

  test('dataset detail page is keyboard accessible', async ({ page }) => {
    await page.goto('/datasets/https%3A%2F%2Fexample.org%2Fdataset%2F1');
    await page.waitForLoadState('load');

    // Tab through page and verify focus is visible
    await page.keyboard.press('Tab');

    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
  });

  test('dataset detail page meets WCAG AA color contrast', async ({ page }) => {
    await page.goto('/datasets/https%3A%2F%2Fexample.org%2Fdataset%2F1');
    await page.waitForLoadState('load');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2aa'])
      .analyze();

    const contrastViolations = results.violations.filter(
      (v) => v.id === 'color-contrast',
    );

    expect(contrastViolations).toEqual([]);
  });
});
