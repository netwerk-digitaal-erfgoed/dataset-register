import { describe, expect, it, vi } from 'vitest';
import { createLabelResolver } from './labels';

interface LabelDocument {
  id: string;
  label: string;
  label_nl?: string;
  label_en?: string;
  type: string;
}

const ORG = 'https://example.org/org/kb';
const AAT = 'https://vocab.getty.edu/aat/';

const DOCUMENTS: LabelDocument[] = [
  {
    id: ORG,
    label: 'Koninklijke Bibliotheek',
    label_nl: 'Koninklijke Bibliotheek',
    type: 'organization',
  },
  {
    id: AAT,
    label: 'Art & Architecture Thesaurus',
    label_nl: 'Kunst- en architectuurthesaurus',
    label_en: 'Art & Architecture Thesaurus',
    type: 'terminology_source',
  },
];

/**
 * An exporter double that returns the labels as newline-delimited JSON, counting
 * calls so the cache can be asserted.
 */
function mockExporter(documents: LabelDocument[] = DOCUMENTS) {
  const exported = documents
    .map((document) => JSON.stringify(document))
    .join('\n');
  const exportSpy = vi.fn(async () => exported);
  return { exportSpy };
}

describe('createLabelResolver', () => {
  it('resolves IRIs to the requested locale’s label', async () => {
    const { exportSpy } = mockExporter();
    const resolver = createLabelResolver(exportSpy);

    const labels = await resolver.resolve([ORG, AAT], 'nl');

    expect(labels.get(ORG)).toBe('Koninklijke Bibliotheek');
    expect(labels.get(AAT)).toBe('Kunst- en architectuurthesaurus');
  });

  it('falls back to the default label when the locale variant is absent', async () => {
    const { exportSpy } = mockExporter();
    const resolver = createLabelResolver(exportSpy);

    // The organization has no English variant, so the default (Dutch) label wins.
    const labels = await resolver.resolve([ORG], 'en');

    expect(labels.get(ORG)).toBe('Koninklijke Bibliotheek');
  });

  it('omits IRIs that are not in the collection', async () => {
    const { exportSpy } = mockExporter();
    const resolver = createLabelResolver(exportSpy);

    const labels = await resolver.resolve(
      [ORG, 'https://example.org/unknown'],
      'nl',
    );

    expect(labels.has('https://example.org/unknown')).toBe(false);
    expect(labels.size).toBe(1);
  });

  it('caches the collection across calls (one export within the TTL)', async () => {
    const { exportSpy } = mockExporter();
    const resolver = createLabelResolver(exportSpy);

    await resolver.resolve([ORG], 'nl');
    await resolver.resolve([AAT], 'en');

    expect(exportSpy).toHaveBeenCalledTimes(1);
  });

  it('shares a single export across concurrent first loads (single-flight)', async () => {
    const { exportSpy } = mockExporter();
    const resolver = createLabelResolver(exportSpy);

    await Promise.all([
      resolver.resolve([ORG], 'nl'),
      resolver.resolve([AAT], 'nl'),
    ]);

    expect(exportSpy).toHaveBeenCalledTimes(1);
  });

  it('refetches after the cache is cleared', async () => {
    const { exportSpy } = mockExporter();
    const resolver = createLabelResolver(exportSpy);

    await resolver.resolve([ORG], 'nl');
    resolver.clear();
    await resolver.resolve([ORG], 'nl');

    expect(exportSpy).toHaveBeenCalledTimes(2);
  });

  it('refetches once the TTL has elapsed', async () => {
    vi.useFakeTimers();
    try {
      const { exportSpy } = mockExporter();
      const resolver = createLabelResolver(exportSpy, { ttlMs: 1000 });

      await resolver.resolve([ORG], 'nl');
      vi.advanceTimersByTime(1001);
      await resolver.resolve([ORG], 'nl');

      expect(exportSpy).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
