import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchIndexStatistics, parseIndexStatistics } from './index-statistics';

const stats = {
  'name-index': 'NDE Dataset Register',
  'num-triples-normal': 1063924,
  'num-triples-internal': 23236279,
  'num-subjects-normal': 171847,
  'num-predicates-normal': 89,
  'num-predicates-internal': 74,
  'num-objects-normal': 274464,
};

afterEach(() => vi.unstubAllGlobals());

describe('QLever index information', () => {
  it('uses normal counts and omits QLever internal triples and predicates', () => {
    expect(parseIndexStatistics(stats)).toEqual({
      name: 'NDE Dataset Register',
      triples: 1063924,
      subjects: 171847,
      predicates: 89,
      objects: 274464,
    });
  });

  it('rejects incomplete or nonnumeric statistics instead of showing invented zero counts', () => {
    expect(() =>
      parseIndexStatistics({ ...stats, 'num-triples-normal': null }),
    ).toThrow();
    expect(() =>
      parseIndexStatistics({ ...stats, 'num-objects-normal': -1 }),
    ).toThrow();
  });

  it('requests cmd=stats from the configured endpoint and propagates cancellation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(stats));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    const result = await fetchIndexStatistics(
      'https://example.org/sparql',
      controller.signal,
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://example.org/sparql?cmd=stats',
    );
    expect(fetchMock.mock.calls[0]?.[1].signal).toBe(controller.signal);
    expect(result.triples).toBe(1063924);
  });

  it('reports an HTTP failure so the dialog can offer a retry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('', { status: 503 })),
    );
    await expect(
      fetchIndexStatistics(
        'https://example.org/sparql',
        new AbortController().signal,
      ),
    ).rejects.toThrow('503');
  });
});
