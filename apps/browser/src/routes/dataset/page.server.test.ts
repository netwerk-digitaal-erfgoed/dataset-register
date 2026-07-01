import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/services/dataset-detail', () => ({
  fetchDatasetDetail: vi.fn(async (uri: string) => ({ receivedUri: uri })),
  // The analysis cache (loaded transitively via +page.server.ts) imports these;
  // stub them so the strict mock resolves. The loader test does not exercise them.
  fetchDatasetAnalysis: vi.fn(),
  DatasetSummarySchema: {},
  ClassPartitionSchema: {},
  LinksetSchema: {},
}));

import { load } from './+page.server';
import { fetchDatasetDetail } from '$lib/services/dataset-detail';

function makeEvent(search: string) {
  return {
    url: new URL(`http://localhost/dataset${search}`),
  } as unknown as Parameters<typeof load>[0];
}

describe('/dataset loader', () => {
  it('passes through an https IRI verbatim', async () => {
    const result = await load(
      makeEvent(
        '?uri=' +
          encodeURIComponent(
            'https://data.colonialcollections.nl/nmvw/collection-archives',
          ),
      ),
    );
    expect(fetchDatasetDetail).toHaveBeenCalledWith(
      'https://data.colonialcollections.nl/nmvw/collection-archives',
      expect.any(Function), // injected cache-wrapping analysis fetcher
    );
    expect(result).toEqual({
      receivedUri:
        'https://data.colonialcollections.nl/nmvw/collection-archives',
    });
  });

  it('preserves the http scheme without coercing to https', async () => {
    await load(
      makeEvent('?uri=' + encodeURIComponent('http://legacy.example/foo')),
    );
    expect(fetchDatasetDetail).toHaveBeenCalledWith(
      'http://legacy.example/foo',
      expect.any(Function), // injected cache-wrapping analysis fetcher
    );
  });

  it('throws a 400 when the uri query parameter is missing', async () => {
    let caught: unknown;
    try {
      await load(makeEvent(''));
    } catch (error) {
      caught = error;
    }
    expect((caught as { status?: number } | undefined)?.status).toBe(400);
  });

  // A literal `+` shared without percent-encoding decodes to a space, yielding an
  // IRI that is illegal inside a SPARQL IRIREF. Guard with a 404 rather than
  // letting the malformed query throw a 500.
  it('throws a 404 when the uri contains a space (decoded from a literal +)', async () => {
    let caught: unknown;
    try {
      await load(
        makeEvent(
          '?uri=' +
            'https://collecties.zuidafrikahuis.nl/AtlantisPubliek/data/dataset/Zuid-Afrikahuis+-+Archieven',
        ),
      );
    } catch (error) {
      caught = error;
    }
    expect((caught as { status?: number } | undefined)?.status).toBe(404);
    expect(fetchDatasetDetail).not.toHaveBeenCalledWith(
      expect.stringContaining(' '),
    );
  });
});
