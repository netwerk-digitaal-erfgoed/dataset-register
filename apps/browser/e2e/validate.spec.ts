import { test, expect } from './fixtures';

// `<https://example.org/dataset> a <https://schema.org/Dataset> .` in the
// share-link format (`~1` + deflate-raw + base64url), as the Paste tab writes it.
const sharedTurtle =
  '~1s8koKSkottLXT61IzC3ISdXLL0rXT0ksSSxOLbFTSFSwgckXJ2ek5iaCpV1g0noA';

test.describe('Validate page', () => {
  test('a shared #rdf= link opens the Paste tab with the pasted RDF', async ({
    page,
  }) => {
    await page.goto(`/validate#rdf=${sharedTurtle}`);

    await expect(page.getByRole('tab', { name: 'Plakken' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.locator('.cm-content')).toContainText(
      'https://example.org/dataset',
    );
  });
});
