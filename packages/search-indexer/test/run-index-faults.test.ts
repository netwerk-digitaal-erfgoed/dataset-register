import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataFactory } from 'n3';
import { Errors, type Client } from 'typesense';
import { RebuildAlreadyRunning } from '@lde/search-typesense';
import type { Quad } from '@rdfjs/types';
import type { RunContext, RunWriter } from '@lde/pipeline';
import type { SearchDocument, SearchType } from '@lde/search';

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
/** One organization label triple for the Organization collection rebuild. */
const ORG_LABEL_QUADS: Quad[] = [
  quad(namedNode('urn:ex:org1'), namedNode(FOAF_NAME), literal('Voorbeeld')),
];

// The faults injected here (a failing lock backend, a rejected commit, a failing
// label rebuild) cannot be provoked through the real containers without
// contrivance, so the Typesense client, the register reader and the blue/green
// writer are mocked. Every OTHER path stays on the real code under test (the
// dataset + label projections and the runIndex control flow). The mocked writer
// is used for both the dataset collection and the three typed label collections;
// its `openRun` is handed the `SearchType` so a test can fail one and not another.
const mocks = vi.hoisted(() => ({
  openRun: vi.fn(),
  client: undefined as unknown as Client,
  registerQuads: [] as Quad[],
  orgLabelQuads: [] as Quad[],
  orgLabelError: false,
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
      return mocks.orgLabelError
        ? Promise.reject(new Error('label read failed'))
        : Promise.resolve(mocks.orgLabelQuads);
    }
  },
}));

// Replace only the blue/green writer; keep the real `RebuildAlreadyRunning` so
// runIndex’s `instanceof` skip check still recognises the lock-held case. The
// captured `searchType` lets `openRun` distinguish the dataset rebuild from a
// label-collection rebuild.
vi.mock('@lde/search-typesense', async (importOriginal) => {
  const actual = await importOriginal<object>();
  return {
    ...actual,
    BlueGreenRebuild: class {
      readonly #searchType: SearchType;
      constructor(_client: unknown, searchType: SearchType) {
        this.#searchType = searchType;
      }
      openRun(context: RunContext): unknown {
        return mocks.openRun(context, this.#searchType);
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
  /** Fail an `aliases(alias).retrieve()` with a NON-404 error (transient blip),
   *  to prove the guards fail closed rather than treat it as a cold start. */
  readonly aliasRetrieveError?: boolean;
}

/** A minimal Typesense client covering only the calls runIndex makes directly:
 *  the synonym sync and the alias look-ups (the blue/green writer is mocked, so
 *  its own collection/import/alias calls never run here). */
function fakeClient(config: FakeClientConfig = {}): Client {
  return {
    synonymSets: () => ({ upsert: async () => ({}) }),
    aliases: (alias?: string) => ({
      retrieve: async () => {
        if (config.aliasRetrieveError) {
          throw new Errors.ServerError('Typesense unavailable', '', 503);
        }
        const target =
          alias === undefined ? undefined : config.aliasTargets?.[alias];
        if (target === undefined) {
          // A missing alias is a genuine 404 (cold start / unset); the code
          // treats only this as “no index”, and any other error propagates.
          throw new Errors.ObjectNotFound('alias not found');
        }
        return { collection_name: target };
      },
      upsert: async () => ({}),
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
        // Drain so the projection and the counting generator run.
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
    // Default: every rebuild (dataset + labels) opens a working run.
    mocks.openRun.mockImplementation(async () => fakeRun());
    mocks.registerQuads = REGISTER_QUADS;
    mocks.orgLabelQuads = [];
    mocks.orgLabelError = false;
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

  it('exercises the RunContext selection accessor the writer is handed', async () => {
    mocks.openRun.mockImplementationOnce(async (context: RunContext) => {
      expect([...context.selectedSources()]).toEqual([]);
      return fakeRun();
    });

    const result = await runIndex(baseOptions);

    expect(result).toMatchObject({ mode: 'rebuild', collection: 'datasets' });
  });

  it('keeps the dataset rebuild when a label rebuild fails', async () => {
    mocks.orgLabelQuads = ORG_LABEL_QUADS;
    // The dataset rebuild succeeds; every label rebuild fails to open its run.
    mocks.openRun.mockImplementation(async (_context, type: SearchType) => {
      if (type.name !== 'Dataset') {
        throw new Error('label writer boom');
      }
      return fakeRun();
    });

    const logs: string[] = [];
    const result = await runIndex({
      ...baseOptions,
      log: (message) => logs.push(message),
    });

    // The user-facing dataset index still went live; only the labels degraded.
    expect(result).toMatchObject({ mode: 'rebuild', collection: 'datasets' });
    expect(logs.some((line) => line.startsWith('Label index'))).toBe(true);
    expect(logs.some((line) => line.includes('label writer boom'))).toBe(true);
  });

  it('skips a label rebuild whose lock is already held by another rebuild', async () => {
    mocks.orgLabelQuads = ORG_LABEL_QUADS;
    mocks.openRun.mockImplementation(async (_context, type: SearchType) => {
      if (type.name !== 'Dataset') {
        throw new RebuildAlreadyRunning(type.name);
      }
      return fakeRun();
    });

    const logs: string[] = [];
    const result = await runIndex({
      ...baseOptions,
      log: (message) => logs.push(message),
    });

    expect(result.mode).toBe('rebuild');
    expect(
      logs.some((line) => line.includes('another rebuild is already running')),
    ).toBe(true);
  });

  it('keeps the dataset index when a label rebuild commit fails, aborting its run', async () => {
    mocks.orgLabelQuads = ORG_LABEL_QUADS;
    const abort = vi.fn(async () => undefined);
    mocks.openRun.mockImplementation(async (_context, type: SearchType) => {
      if (type.name !== 'Dataset') {
        return fakeRun({
          commit: async () => {
            throw new Error('label commit boom');
          },
          abort,
        });
      }
      return fakeRun();
    });

    const logs: string[] = [];
    const result = await runIndex({
      ...baseOptions,
      log: (message) => logs.push(message),
    });

    // The dataset index still went live; the failed label rebuild aborted its
    // run and was logged, not rethrown.
    expect(result.mode).toBe('rebuild');
    expect(abort).toHaveBeenCalled();
    expect(logs.some((line) => line.includes('label commit boom'))).toBe(true);
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

    const logs: string[] = [];
    const result = await runIndex({
      ...baseOptions,
      log: (message) => logs.push(message),
    });

    expect(result.mode).toBe('rebuild');
    expect(logs.some((line) => line.startsWith('Synonym sync skipped'))).toBe(
      true,
    );
  });

  it('keeps the previous label collection when a rebuild would be empty', async () => {
    // No organization labels this run, but the Organization collection already
    // exists: swapping an empty collection over it would strip the labels, so
    // the rebuild keeps the current one.
    mocks.orgLabelQuads = [];
    mocks.client = fakeClient({
      aliasTargets: { organizations: 'organizations_1' },
    });

    const logs: string[] = [];
    const result = await runIndex({
      ...baseOptions,
      log: (message) => logs.push(message),
    });

    expect(result.mode).toBe('rebuild');
    expect(
      logs.some(
        (line) =>
          line.startsWith('Label index organizations skipped') &&
          line.includes('keeping the current collection'),
      ),
    ).toBe(true);
  });

  it('keeps the live index when the projection produces no documents', async () => {
    // Register read succeeds but yields nothing to project (a transient upstream
    // gap). A live index exists, so the rebuild must abort rather than swap the
    // populated index for an empty one.
    mocks.registerQuads = [];
    mocks.client = fakeClient({ aliasTargets: { datasets: 'datasets_1' } });
    const commit = vi.fn(async () => undefined);
    const abort = vi.fn(async () => undefined);
    mocks.openRun.mockResolvedValueOnce(fakeRun({ commit, abort }));

    const result = await runIndex(baseOptions);

    expect(result).toEqual({ mode: 'skipped', reason: 'empty-projection' });
    expect(commit).not.toHaveBeenCalled();
    expect(abort).toHaveBeenCalledOnce();
  });

  it('still builds an empty index on a cold start with no data', async () => {
    // No live index yet (alias unset) and no data: the empty collection must
    // still be committed so queries have something to hit.
    mocks.registerQuads = [];
    mocks.client = fakeClient();
    const commit = vi.fn(async () => undefined);
    mocks.openRun.mockResolvedValueOnce(fakeRun({ commit }));

    const result = await runIndex(baseOptions);

    expect(result).toMatchObject({ mode: 'rebuild', upserted: 0 });
    expect(commit).toHaveBeenCalledOnce();
  });

  it('fails closed when the alias check errors instead of wiping the index', async () => {
    // A non-404 error on the alias retrieve must propagate, not be mistaken for
    // a cold start (which would let an empty/degraded index swap live).
    mocks.registerQuads = [];
    mocks.client = fakeClient({ aliasRetrieveError: true });
    const abort = vi.fn(async () => undefined);
    mocks.openRun.mockResolvedValueOnce(fakeRun({ abort }));

    await expect(runIndex(baseOptions)).rejects.toThrow(
      'Typesense unavailable',
    );
    expect(abort).toHaveBeenCalledOnce();
  });

  it('keeps the current label collections when the prefetched label read fails', async () => {
    // The label read (prefetched at the start of the run) rejects. The dataset
    // index still goes live; the label rebuild is skipped so the previous label
    // collections stay.
    mocks.orgLabelError = true;

    const logs: string[] = [];
    const result = await runIndex({
      ...baseOptions,
      log: (message) => logs.push(message),
    });

    expect(result.mode).toBe('rebuild');
    expect(logs.some((line) => line.startsWith('Label read failed'))).toBe(
      true,
    );
  });
});
