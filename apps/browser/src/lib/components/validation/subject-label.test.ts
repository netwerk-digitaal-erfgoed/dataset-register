import { describe, expect, it } from 'vitest';
import { subjectLabel } from './subject-label.js';

// Labels resolve through Paraglide, so they come back in the base locale (nl).
describe('subjectLabel', () => {
  it('names the subject of a schema.org focus node', () => {
    expect(subjectLabel('https://schema.org/DataCatalog')).toBe(
      'Datacatalogus',
    );
    expect(subjectLabel('https://schema.org/Dataset')).toBe('Dataset');
    expect(subjectLabel('https://schema.org/DataDownload')).toBe('Distributie');
  });

  it('names the subject of a DCAT focus node', () => {
    expect(subjectLabel('http://www.w3.org/ns/dcat#Catalog')).toBe(
      'Datacatalogus',
    );
    expect(subjectLabel('http://www.w3.org/ns/dcat#Distribution')).toBe(
      'Distributie',
    );
  });

  it('accepts the http schema.org prefix that sources publish', () => {
    // Focus-node types come from the unmodified source, which may use
    // http://schema.org where the shapes and the report use https://schema.org.
    expect(subjectLabel('http://schema.org/DataCatalog')).toBe('Datacatalogus');
  });

  it('returns nothing for an unknown or absent type', () => {
    expect(subjectLabel('https://example.org/Thing')).toBeUndefined();
    expect(subjectLabel(undefined)).toBeUndefined();
  });
});
