import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/services/dataset-detail', () => ({
  fetchDatasetDetail: vi.fn(async (uri: string) => ({ receivedUri: uri })),
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
});
