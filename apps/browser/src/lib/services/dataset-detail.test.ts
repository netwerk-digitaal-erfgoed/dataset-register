import { afterEach, describe, expect, it, vi } from 'vitest';
import { SparqlEndpointFetcher } from 'fetch-sparql-endpoint';
import { isDatasetSparqlEndpoint } from './dataset-detail';

describe('isDatasetSparqlEndpoint', () => {
  const fetchAsk = vi.spyOn(SparqlEndpointFetcher.prototype, 'fetchAsk');

  afterEach(() => {
    fetchAsk.mockReset();
  });

  it('asks the register for a SPARQL distribution with that access URL', async () => {
    fetchAsk.mockResolvedValue(true);
    expect(
      await isDatasetSparqlEndpoint(
        'https://example.org/dataset',
        'https://example.org/sparql',
      ),
    ).toBe(true);
    const query = fetchAsk.mock.calls[0][1];
    expect(query).toContain('<https://example.org/dataset> dcat:distribution');
    expect(query).toContain(
      'dct:conformsTo <https://www.w3.org/TR/sparql11-protocol/>',
    );
    expect(query).toContain(
      'FILTER(STR(?accessURL) = "https://example.org/sparql")',
    );
  });

  it.each([
    ['', 'https://example.org/sparql'],
    ['dataset', 'https://example.org/sparql'],
    ['https://example.org/dataset', 'https://example.org/sparql"'],
    ['https://example.org/dataset', 'https://example.org/a b'],
  ])('rejects %s with %s without querying', async (dataset, endpoint) => {
    expect(await isDatasetSparqlEndpoint(dataset, endpoint)).toBe(false);
    expect(fetchAsk).not.toHaveBeenCalled();
  });
});
