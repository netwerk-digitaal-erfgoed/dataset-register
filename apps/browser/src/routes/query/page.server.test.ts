import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/services/dataset-detail', () => ({
  isDatasetSparqlEndpoint: vi.fn(
    async (_dataset: string, endpoint: string) =>
      endpoint === 'https://example.org/sparql',
  ),
}));

import { load } from './+page.server';

function loadWith(search: string) {
  return load({
    url: new URL(`http://localhost/query${search}`),
  } as unknown as Parameters<typeof load>[0]);
}

describe('/query loader', () => {
  it('queries the register without dataset parameters', async () => {
    expect(await loadWith('')).toEqual({ target: undefined });
  });

  it('accepts one of the dataset’s SPARQL endpoints', async () => {
    expect(
      await loadWith(
        '?dataset=https://example.org/dataset&endpoint=https://example.org/sparql',
      ),
    ).toEqual({
      target: {
        dataset: 'https://example.org/dataset',
        endpoint: 'https://example.org/sparql',
      },
    });
  });

  it.each([
    '?dataset=https://example.org/dataset&endpoint=https://evil.example/sparql',
    '?endpoint=https://example.org/sparql',
    '?dataset=https://example.org/dataset',
  ])('rejects %s', async (search) => {
    await expect(loadWith(search)).rejects.toMatchObject({ status: 404 });
  });
});
