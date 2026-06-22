import { describe, expect, it } from 'vitest';
import { summarizeDescription } from './description-summary.js';

describe('summarizeDescription', () => {
  it('returns no datasets for empty input', async () => {
    expect(await summarizeDescription('', 'application/ld+json')).toEqual({
      datasetCount: 0,
    });
  });

  it('counts a single JSON-LD dataset description', async () => {
    const source = JSON.stringify({
      '@context': 'https://schema.org/',
      '@type': 'Dataset',
      '@id': 'https://example.org/dataset',
    });
    expect(await summarizeDescription(source, 'application/ld+json')).toEqual({
      datasetCount: 1,
    });
  });

  it('does not count a back-referenced catalog as extra datasets (JSON-LD)', async () => {
    // A single dataset that names the catalog it is part of via
    // schema:includedInDataCatalog must still count as one dataset, not as a
    // catalog – regression for a single DANS dataset description.
    const source = JSON.stringify({
      '@context': 'https://schema.org/',
      '@type': 'Dataset',
      '@id': 'https://example.org/dataset',
      includedInDataCatalog: {
        '@type': 'DataCatalog',
        '@id': 'https://example.org/catalog',
        dataset: [{ '@type': 'Dataset', '@id': 'https://example.org/dataset' }],
      },
    });
    expect(await summarizeDescription(source, 'application/ld+json')).toEqual({
      datasetCount: 1,
    });
  });

  it('counts the datasets inside a data catalog (JSON-LD)', async () => {
    const source = JSON.stringify({
      '@context': { dcat: 'http://www.w3.org/ns/dcat#' },
      '@type': 'dcat:Catalog',
      '@id': 'https://example.org/catalog',
      'dcat:dataset': [
        { '@type': 'dcat:Dataset', '@id': 'https://example.org/a' },
        { '@type': 'dcat:Dataset', '@id': 'https://example.org/b' },
      ],
    });
    expect(await summarizeDescription(source, 'application/ld+json')).toEqual({
      datasetCount: 2,
    });
  });

  it('counts distinct datasets (Turtle)', async () => {
    const source = `
      @prefix dcat: <http://www.w3.org/ns/dcat#> .
      <https://example.org/catalog> a dcat:Catalog ;
        dcat:dataset <https://example.org/a>, <https://example.org/b> .
      <https://example.org/a> a dcat:Dataset .
      <https://example.org/b> a dcat:Dataset .
    `;
    expect(await summarizeDescription(source, 'text/turtle')).toEqual({
      datasetCount: 2,
    });
  });

  it('counts several dataset descriptions without a catalog node (Turtle)', async () => {
    // A SPARQL CONSTRUCT result returns bare dataset descriptions and no
    // dcat:Catalog node, yet it is still presented as a catalog by count.
    const source = `
      @prefix schema: <https://schema.org/> .
      <https://example.org/a> a schema:Dataset .
      <https://example.org/b> a schema:Dataset .
    `;
    expect(await summarizeDescription(source, 'text/turtle')).toEqual({
      datasetCount: 2,
    });
  });
});
