import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataFactory } from 'n3';
import type { Client, ImportResponse } from 'typesense';
import type { Quad } from '@rdfjs/types';
import type { RunContext, RunWriter } from '@lde/pipeline';
import type { SearchDocument } from '@lde/search';

const { namedNode, literal, quad } = DataFactory;

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const DCAT_DATASET = 'http://www.w3.org/ns/dcat#Dataset';
const DCT_TITLE = 'http://purl.org/dc/terms/title';
const FOAF_NAME = 'http://xmlns.com/foaf/0.1/name';

/** One framable dataset subgraph so `projectDatasets` yields a real document. */
const REGISTER_QUADS: Quad[] = [
  quad(namedNode('urn:ex:d1'), namedNode(RDF_TYPE), namedNode(DCAT_DATASET)),
  quad(namedNode('urn:ex:d1'), namedNode(DCT_TITLE), literal('Titel', 'nl')),
];
/** One organization label triple for the sidecar labels rebuild. */
const ORG_LABEL_QUADS: Quad[] = [
  quad(namedNode('urn:ex:org1'), namedNode(FOAF_NAME), literal('Voorbeeld')),
];

// The faults injected here (a failing lock backend, a rejected commit, a
// Typesense per-document label-import failure) cannot be provoked through the
// real containers without contrivance, so the Typesense client, the register
// reader and the blue/green writer are mocked. Every OTHER path stays on the
// real code under test (projection, label-document building, the runIndex
// control flow). Shared mutable handles the hoisted mock factories read.
const mocks = vi.hoisted(() => ({
  openRun: vi.fn(),
  client: undefined as unknown as Client,
  registerQuads: [] as Quad[],
  orgLabelQuads: [] as Quad[],
}));

vi.mock('../src/typesense-client.ts', () => ({
  createTypesenseClient: () => mocks.client,
}));

vi.mock('../src/register-source.ts', () => ({
  RegisterSource: class {
    readQuads(): Promise<Quad[]> {
      return Promise.resolve(mocks.registerQuads);
    }
    readOrganizationLabelQuads(): Promise<Quad[]> {
      return Promise.resolve(mocks.orgLabelQuads);
    }
  },
}));

// Replace only the blue/green writer; keep the real `RebuildAlreadyRunning` so
// runIndex’s `instanceof` skip check still recognises the lock-held case.
vi.mock('@lde/search-typesense', async (importOriginal) => {
  const actual = await importOriginal<object>();
  return {
    ...actual,
    BlueGreenRebuild: class {
      openRun(context: RunContext): unknown {
        return mocks.openRun(context);
      }
    },
  };
});

// Imported after the mocks are registered so it binds to them.
const { runIndex } = await import('../src/run-index.ts');

const CONNECTION = {
  host: 'localhost',
  port: 8108,
  protocol: 'http',
  apiKey: 'test',
};

interface FakeClientConfig {
  /** Alias → collection it resolves to; an absent alias 404s (cold/unset). */
  readonly aliasTargets?: Readonly<Record<string, string>>;
  /** The result the labels import returns (default: one success). */
  readonly importResults?: readonly ImportResponse[];
  /** Make the superseded-collection drop reject (best-effort cleanup path). */
  readonly deleteRejects?: boolean;
}

/** A minimal Typesense client covering only the calls runIndex makes directly
 *  (the blue/green writer is mocked, so its own client calls never run here). */
function fakeClient(config: FakeClientConfig = {}): Client {
  const notFound = () =>
    Object.assign(new Error('not found'), { httpStatus: 404 });
  return {
    synonymSets: () => ({ upsert: async () => ({}) }),
    aliases: (alias?: string) => ({
      retrieve: async () => {
        const target =
          alias === undefined ? undefined : config.aliasTargets?.[alias];
        if (target === undefined) {
          throw notFound();
        }
        return { collection_name: target };
      },
      upsert: async () => ({}),
    }),
    collections: () => ({
      create: async () => ({}),
      delete: async () => {
        if (config.deleteRejects) {
          throw new Error('drop failed');
        }
        return {};
      },
      documents: () => ({
        import: async () => config.importResults ?? [{ success: true }],
      }),
    }),
  } as unknown as Client;
}

/** A writer run whose per-dataset write drains the document stream (exercising
 *  the real projection + counting generator), with configurable finalizers. */
function fakeRun(
  overrides: Partial<RunWriter<SearchDocument>> = {},
): RunWriter<SearchDocument> {
  return {
    write: async (_dataset, documents) => {
      for await (const _document of documents) {
        // Drain so `projectDatasets` and the counting generator run.
      }
    },
    commit: async () => undefined,
    abort: async () => undefined,
    flush: async () => undefined,
    reset: async () => undefined,
    ...overrides,
  };
}

const baseOptions = {
  sparqlUrl: 'http://localhost/sparql',
  typesense: CONNECTION,
};

describe('runIndex fault handling', () => {
  beforeEach(() => {
    mocks.openRun.mockReset();
    mocks.registerQuads = REGISTER_QUADS;
    mocks.orgLabelQuads = [];
    mocks.client = fakeClient();
  });

  it('rethrows a non-lock openRun failure instead of skipping', async () => {
    mocks.openRun.mockRejectedValueOnce(new Error('lock backend down'));

    await expect(runIndex(baseOptions)).rejects.toThrow('lock backend down');
  });

  it('aborts the run and rethrows when the commit fails', async () => {
    const abort = vi.fn(async () => undefined);
    mocks.openRun.mockResolvedValueOnce(
      fakeRun({
        commit: async () => {
          throw new Error('commit boom');
        },
        abort,
      }),
    );

    await expect(runIndex(baseOptions)).rejects.toThrow('commit boom');
    expect(abort).toHaveBeenCalledOnce();
  });

  it('keeps the dataset rebuild when the labels import fails', async () => {
    mocks.orgLabelQuads = ORG_LABEL_QUADS;
    // Datasets alias unset → the result collection falls back to the alias name.
    mocks.client = fakeClient({
      importResults: [{ success: false, error: 'bad field', code: 400 }],
    });
    mocks.openRun.mockImplementationOnce(async (context: RunContext) => {
      // Exercise the RunContext selection accessor the writer is handed.
      expect([...context.selectedSources()]).toEqual([]);
      return fakeRun();
    });

    const logs: string[] = [];
    const result = await runIndex({ ...baseOptions, log: (m) => logs.push(m) });

    // The user-facing dataset index still went live; only the sidecar degraded.
    expect(result).toMatchObject({ mode: 'rebuild', collection: 'datasets' });
    expect(logs.some((line) => line.startsWith('Label index skipped'))).toBe(
      true,
    );
  });

  it('swallows a failed drop of the superseded labels collection', async () => {
    mocks.orgLabelQuads = ORG_LABEL_QUADS;
    mocks.client = fakeClient({
      aliasTargets: { datasets: 'datasets_1', labels: 'labels_old' },
      deleteRejects: true,
    });
    mocks.openRun.mockResolvedValueOnce(fakeRun());

    const logs: string[] = [];
    const result = await runIndex({ ...baseOptions, log: (m) => logs.push(m) });

    expect(result).toMatchObject({ mode: 'rebuild', collection: 'datasets_1' });
    // The swap logged success despite the best-effort drop rejecting.
    expect(logs.some((line) => line.startsWith('Indexed 1 labels'))).toBe(true);
  });

  it('swallows a synonym-sync failure and still rebuilds', async () => {
    mocks.client = {
      ...fakeClient(),
      synonymSets: () => ({
        upsert: async () => {
          throw new Error('synonyms down');
        },
      }),
    } as unknown as Client;
    mocks.openRun.mockResolvedValueOnce(fakeRun());

    const logs: string[] = [];
    const result = await runIndex({ ...baseOptions, log: (m) => logs.push(m) });

    expect(result.mode).toBe('rebuild');
    expect(logs.some((line) => line.startsWith('Synonym sync skipped'))).toBe(
      true,
    );
  });

  it('skips the labels import when there are no label documents', async () => {
    mocks.orgLabelQuads = [];
    mocks.client = fakeClient({
      // Force an import failure so, were it called, the run would log a skip;
      // proving the empty set short-circuits before the import.
      importResults: [{ success: false, error: 'unexpected', code: 400 }],
    });
    mocks.openRun.mockResolvedValueOnce(fakeRun());

    const logs: string[] = [];
    const result = await runIndex({ ...baseOptions, log: (m) => logs.push(m) });

    expect(result.mode).toBe('rebuild');
    // The empty set short-circuits the import (no skip logged) yet still swaps
    // the labels alias to a fresh, empty collection.
    expect(logs.some((line) => line.startsWith('Indexed 0 labels'))).toBe(true);
    expect(logs.some((line) => line.startsWith('Label index skipped'))).toBe(
      false,
    );
  });
});
