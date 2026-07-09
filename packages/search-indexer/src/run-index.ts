import { Client, Errors, type ImportResponse } from 'typesense';
import { BlueGreenRebuild, RebuildAlreadyRunning } from '@lde/search-typesense';
import {
  projectGraph,
  type SearchDocument,
  type SearchSchema,
  type SearchType,
} from '@lde/search';
import { Dataset } from '@lde/dataset';
import type { RunContext } from '@lde/pipeline';
import {
  DATASET_TYPE,
  DEFAULT_REGISTRATIONS_GRAPH,
  DEFAULT_SORTING_FIELD,
  LABELS_COLLECTION_ALIAS,
  SEARCH_COLLECTION_ALIAS,
  SEARCH_SCHEMA,
  SEARCH_SYNONYM_SET,
  SEARCH_SYNONYMS,
  SparqlClient,
} from '@dataset-register/core';
import type { Quad } from '@rdfjs/types';
import {
  buildLabelCollectionSchema,
  toLabelDocuments,
  type LabelDocument,
} from './labels.js';
import { RegisterSource } from './register-source.js';
import { DkgSource } from './dkg-source.js';
import {
  createTypesenseClient,
  type TypesenseConnection,
} from './typesense-client.js';

export interface RunIndexOptions {
  readonly sparqlUrl: string;
  readonly registrationsGraphIri?: string;
  /** Dataset Knowledge Graph SPARQL endpoint; when absent, no DKG enrichment. */
  readonly knowledgeGraphEndpoint?: string;
  readonly typesense: TypesenseConnection;
  readonly collectionAlias?: string;
  /** Override the sidecar label-collection alias (test isolation). */
  readonly labelsAlias?: string;
  /** Optional sink for progress lines; defaults to silent. */
  readonly log?: (message: string) => void;
}

/**
 * Why a run left the live index untouched. `concurrent-rebuild`: another rebuild
 * already held the cross-pod lock. `empty-knowledge-graph`: a configured DKG
 * returned no enrichment, so the current enriched index was kept rather than
 * swapped for an enrichment-less one. `empty-projection`: the projection produced
 * no documents while a live index already exists, so the populated index was kept
 * rather than replaced with an empty one (see {@link runIndex}).
 */
export type SkipReason =
  | 'concurrent-rebuild'
  | 'empty-knowledge-graph'
  | 'empty-projection';

export type RunIndexResult =
  | {
      readonly mode: 'rebuild';
      readonly collection: string;
      readonly upserted: number;
    }
  /** The run was a no-op and the live index was left untouched. */
  | { readonly mode: 'skipped'; readonly reason: SkipReason };

/**
 * Rebuild the Typesense `datasets` index from the register store.
 *
 * Every run is a full blue/green rebuild, delegated to `@lde/search-typesense`’s
 * {@link BlueGreenRebuild}: it projects every registered dataset into a fresh
 * `${alias}_${timestamp}` collection, atomically swaps the `datasets` alias to
 * it, then drops the previous collection. Correct by construction – a hard
 * delete needs no special handling (an absent dataset is simply not projected),
 * there is no high-water mark and no incremental reconciliation. On failure
 * nothing is swapped, so a register blip never corrupts the live index.
 *
 * {@link BlueGreenRebuild} is single-flight per index (it holds a cross-pod lock
 * in Typesense), so the crawler and every API pod can trigger this concurrently
 * and only one rebuild runs at a time; a trigger arriving mid-rebuild throws
 * {@link RebuildAlreadyRunning}, which is caught and returned as
 * `mode: 'skipped'` rather than queued.
 */
export async function runIndex(
  options: RunIndexOptions,
): Promise<RunIndexResult> {
  const log = options.log ?? (() => undefined);
  const alias = options.collectionAlias ?? SEARCH_COLLECTION_ALIAS;

  const client = createTypesenseClient(options.typesense);
  const source = new RegisterSource(
    new SparqlClient(options.sparqlUrl),
    options.registrationsGraphIri ?? DEFAULT_REGISTRATIONS_GRAPH,
  );

  // The dataset type drives both the collection schema and the projection. It is
  // always present – SEARCH_SCHEMA is built over it – so a miss is a programmer
  // error, not a runtime condition.
  const datasetType = SEARCH_SCHEMA.get(DATASET_TYPE);
  if (datasetType === undefined) {
    throw new Error(
      `SEARCH_SCHEMA does not declare the dataset type ${DATASET_TYPE}.`,
    );
  }

  log(`Rebuilding search index ${alias}`);

  // Kick off every read/sync that does not depend on the writer up front so they
  // overlap instead of serializing on the critical path: the two main CONSTRUCTs
  // (register + DKG, different endpoints), the sidecar label reads, and the
  // synonym-set sync. The label reads and the synonym sync otherwise sit serially
  // – labels after commit, synonyms before the reads – adding their full
  // round-trip latency to the run; overlapping hides it behind the main reads and
  // the import. Each dataset is framed per subject and projected, streamed
  // straight into the rebuild so only one document is held at a time; the
  // versioned collection name, alias swap and cross-pod lock are managed by
  // {@link BlueGreenRebuild}.
  const labelDocumentsPromise = readLabelDocuments(source, options, log);
  // readLabelDocuments can reject (the register org-label read has no fallback);
  // mark it handled so an early skip-return below does not surface an unhandled
  // rejection. rebuildLabels awaits the same promise and its catch handles a real
  // failure by keeping the previous labels.
  labelDocumentsPromise.catch(() => undefined);
  const synonymsPromise = syncSynonyms(client, log);
  const [registerQuads, dkgQuads] = await Promise.all([
    source.readQuads(),
    readKnowledgeGraphQuads(options, log),
  ]);

  // Guard a transient or empty Knowledge Graph from stripping every facet off the
  // live index. The rebuild is a full blue/green swap, so projecting register data
  // with no DKG enrichment would atomically replace a good, enriched index with an
  // enrichment-less one for every dataset at once (no terminology-source facet, no
  // Linked Data summary class data). When a DKG endpoint is configured but returned
  // nothing – unreachable, or reduced to a bootstrap-only store – while the
  // register has data and a live index already exists, keep that index instead of
  // swapping. A run with no DKG endpoint configured, or a cold start with no index
  // yet, still proceeds register-only. The next run self-heals once the DKG is
  // back. (See dataset-knowledge-graph#385, which makes the DKG fail loudly rather
  // than serve empty.)
  if (
    options.knowledgeGraphEndpoint !== undefined &&
    dkgQuads.length === 0 &&
    registerQuads.length > 0 &&
    (await aliasTarget(client, alias)) !== undefined
  ) {
    log(
      `Rebuild of ${alias} skipped: the Knowledge Graph returned no enrichment; keeping the current index to avoid stripping facets`,
    );
    return { mode: 'skipped', reason: 'empty-knowledge-graph' };
  }

  // The collection schema references the synonym set by name, so the sync must
  // complete before openRun creates the collection.
  await synonymsPromise;

  const writer = new BlueGreenRebuild<SearchDocument>(client, datasetType, {
    name: alias,
    defaultSortingField: DEFAULT_SORTING_FIELD,
    // Dutch-stem the folded keyword/reference `*_search` companion fields. The
    // per-locale text fields (title/description/...) carry their own nl/en
    // locale, but `keyword_search` has none of its own, so without a default
    // locale it ships unstemmed while the browser queries it stemmed (verhaal
    // vs verhalen), silently narrowing keyword recall.
    defaultLocale: 'nl',
    // Reference the live synonym set; its items are synced separately each run.
    synonymSets: [SEARCH_SYNONYM_SET],
  });

  let run;
  try {
    run = await writer.openRun(runContext());
  } catch (error) {
    // The cross-pod lock is held by another rebuild: a graceful skip, not a
    // failure. Every other error is genuine and propagates.
    if (error instanceof RebuildAlreadyRunning) {
      log(`Rebuild of ${alias} skipped: another rebuild is already running`);
      return { mode: 'skipped', reason: 'concurrent-rebuild' };
    }
    throw error;
  }

  let upserted = 0;
  try {
    // Count the projected documents as they stream past, so the result carries
    // the imported total the writer does not itself report.
    const documents = (async function* () {
      for await (const document of projectDatasets(
        [...registerQuads, ...dkgQuads],
        datasetType,
      )) {
        upserted++;
        yield document;
      }
    })();
    // Every document is stamped with this run’s single logical source; the DR
    // rebuild projects the whole register in one pass rather than dataset by
    // dataset, so per-dataset rollback never fires (we go straight to commit).
    await run.write(INDEX_SOURCE, documents);
    // A projection that produced no documents would swap an empty collection
    // live and drop the populated one on the next commit. When a live index
    // already exists, keep it (a transient upstream gap self-heals next run)
    // rather than wipe it; a cold start with genuinely no data still commits the
    // empty collection so queries have something to hit.
    if (upserted === 0 && (await aliasTarget(client, alias)) !== undefined) {
      await run.abort(new Error('projection produced no documents'));
      log(
        `Rebuild of ${alias} skipped: projection produced no documents; keeping the current index`,
      );
      return { mode: 'skipped', reason: 'empty-projection' };
    }
    await run.commit();
  } catch (error) {
    await run.abort(error);
    throw error;
  }

  // The writer manages the versioned collection name internally; read it back
  // off the freshly swapped alias for the result and the log line.
  const collection = (await aliasTarget(client, alias)) ?? alias;
  log(`Indexed ${upserted} datasets; alias ${alias} → ${collection}`);

  // Sidecar IRI → label collection for facet-bucket display, rebuilt the same
  // blue/green way. Non-critical: a label failure must never abort the
  // user-facing dataset index (which is already live by now), so it degrades to
  // the previous labels and self-heals next run.
  const labelsAlias = options.labelsAlias ?? LABELS_COLLECTION_ALIAS;
  await rebuildLabels(client, labelsAlias, log, labelDocumentsPromise);

  return { mode: 'rebuild', collection, upserted };
}

/**
 * The synthetic source every dataset document is stamped with. Blue/green
 * stamps a `source` (dataset IRI) on each document for per-dataset rollback;
 * the DR rebuild has no per-dataset lifecycle, so one stable synthetic source
 * suffices – nothing ever rolls back a subset by source.
 */
const INDEX_SOURCE = new Dataset({
  iri: new URL('urn:dr:search-index'),
  distributions: [],
});

/** A fresh {@link RunContext} for one rebuild: blue/green reads only
 *  `startedAt` (to name the versioned collection) and needs no selection scope
 *  (the DR rebuild sweeps nothing – deletion is implicit in the swap). */
function runContext(): RunContext {
  const startedAt = new Date().toISOString();
  return { runId: startedAt, startedAt, selectedSources: () => [] };
}

/**
 * Project ONLY dataset documents from the merged register + DKG quads.
 *
 * `projectGraph` frames and projects EVERY root type in the schema it is handed,
 * so it is scoped here to a single-type schema holding just the dataset type: the
 * `datasets` collection must never receive Organization/Class/TerminologySource
 * label documents (those live in their own collections). The merged quads carry
 * no `rdf:type` other than `dcat:Dataset` today, so the full schema would also
 * emit dataset documents only – scoping the projection keeps that guarantee even
 * if a source later emits typed label nodes.
 *
 * A single-type schema cannot be minted by `searchSchema` (the dataset type’s
 * reference fields name label sources it would omit), so the projection map is
 * built directly; `projectGraph` only reads `schema.values()`, never revalidating.
 */
function projectDatasets(
  quads: readonly Quad[],
  datasetType: SearchType,
): AsyncIterable<SearchDocument> {
  const datasetOnly = new Map([
    [datasetType.type, datasetType],
  ]) as unknown as SearchSchema;
  return projectGraph(quads, datasetOnly);
}

/**
 * The collection an alias currently points at, or `undefined` when the alias is
 * unset. Distinguishes a cold start (no index yet) from a populated one and,
 * after a swap, reports which versioned collection went live.
 *
 * Only a missing alias (Typesense 404) yields `undefined`; every other error
 * propagates. A transient failure must never be mistaken for a cold start, or
 * the empty-Knowledge-Graph and empty-projection guards would fail open and swap
 * a degraded index live.
 */
async function aliasTarget(
  client: Client,
  alias: string,
): Promise<string | undefined> {
  try {
    const { collection_name } = await client.aliases(alias).retrieve();
    return collection_name;
  } catch (error) {
    if (error instanceof Errors.ObjectNotFound) {
      return undefined;
    }
    throw error;
  }
}

/**
 * Read the sidecar label documents: organization IRIs (`foaf:name`) from the
 * register plus terminology-source (`dct:title`) and class (`rdfs:label`) labels
 * from the DKG, read concurrently. Prefetched at the start of a run so it
 * overlaps the main build rather than serializing after commit. Rejects only if
 * the register org-label read fails (the DKG labels degrade to none); the caller
 * treats a rejection as "keep the previous labels".
 */
async function readLabelDocuments(
  source: RegisterSource,
  options: RunIndexOptions,
  log: (message: string) => void,
): Promise<LabelDocument[]> {
  const [organizationQuads, knowledgeGraphLabels] = await Promise.all([
    source.readOrganizationLabelQuads(),
    readKnowledgeGraphLabels(options, log),
  ]);
  return [
    ...toLabelDocuments(organizationQuads, 'organization'),
    ...knowledgeGraphLabels,
  ];
}

/**
 * Build the sidecar `labels` collection from the prefetched label documents.
 * Blue/green-swap its alias with a minimal inline rebuild (create
 * `${alias}_${timestamp}`, import the label docs, repoint the alias, drop the
 * previous collection) – the browser still reads this sidecar in PR 1, so the
 * typed label-source collections are deliberately not introduced here.
 * Defensive: a failure here (including a rejected `documents` read) is logged and
 * swallowed so it never fails an otherwise-good dataset rebuild; labels are
 * display-only and the browser falls back to a shortened IRI when one is missing.
 */
async function rebuildLabels(
  client: Client,
  alias: string,
  log: (message: string) => void,
  documents: Promise<readonly LabelDocument[]>,
): Promise<void> {
  // The collection created below is orphaned if a later step throws before the
  // alias is repointed; track it so the catch can drop it rather than leak it.
  let orphan: string | undefined;
  try {
    const labelDocuments = await documents;

    const collection = `${alias}_${Date.now()}`;
    const previous = await aliasTarget(client, alias);
    await client.collections().create(buildLabelCollectionSchema(collection));
    orphan = collection;
    await importLabels(client, collection, labelDocuments);
    await client.aliases().upsert(alias, { collection_name: collection });
    // Live now: the collection to reap is the superseded `previous`, not this one.
    orphan = undefined;
    if (previous !== undefined && previous !== collection) {
      // Best-effort: dropping the superseded collection must not fail the swap
      // that already made the new labels live.
      await client
        .collections(previous)
        .delete()
        .catch(() => undefined);
    }
    log(
      `Indexed ${labelDocuments.length} labels; alias ${alias} → ${collection}`,
    );
  } catch (error) {
    if (orphan !== undefined) {
      // Drop the half-built collection we created but never swapped live, so a
      // failed label run does not leak an orphaned Typesense collection.
      await client
        .collections(orphan)
        .delete()
        .catch(() => undefined);
    }
    log(`Label index skipped: ${(error as Error).message}`);
  }
}

/**
 * Upsert the label documents into the fresh collection, throwing if any
 * individual document fails (Typesense’s bulk import otherwise reports
 * per-document failures without rejecting). An empty set skips the import –
 * Typesense rejects an empty import body – and the alias still swaps to the
 * (empty) collection.
 */
async function importLabels(
  client: Client,
  collection: string,
  documents: readonly LabelDocument[],
): Promise<void> {
  if (documents.length === 0) {
    return;
  }
  const results = (await client
    .collections(collection)
    .documents()
    .import(documents as LabelDocument[], {
      action: 'upsert',
      throwOnFail: false,
    })) as ImportResponse[];
  const failures = results.filter((result) => !result.success);
  if (failures.length > 0) {
    throw new Error(
      `Typesense label import into “${collection}” failed for ${failures.length}/${results.length} documents: ${failures
        .map((failure) => failure.error)
        .join('; ')}`,
    );
  }
}

/**
 * Read from the Dataset Knowledge Graph, degrading to `fallback` when no DKG
 * endpoint is configured or the read fails – register correctness must never
 * depend on DKG availability, so a DKG gap self-heals on the next successful
 * run. The indexer only reads, and both the register and the DKG are public, so
 * no access token is used (and the register and the DKG are distinct endpoints
 * that would not share one anyway).
 */
async function fromKnowledgeGraph<T>(
  options: RunIndexOptions,
  log: (message: string) => void,
  subject: string,
  fallback: T,
  read: (dkg: DkgSource) => Promise<T>,
): Promise<T> {
  if (options.knowledgeGraphEndpoint === undefined) {
    return fallback;
  }
  const dkg = new DkgSource(new SparqlClient(options.knowledgeGraphEndpoint));
  try {
    return await read(dkg);
  } catch (error) {
    log(`Knowledge Graph ${subject} skipped: ${(error as Error).message}`);
    return fallback;
  }
}

/**
 * Read the DKG-sourced facet labels (terminology sources, classes) as label
 * documents; degrades to register-only (organization) labels when the DKG is
 * absent or fails.
 */
function readKnowledgeGraphLabels(
  options: RunIndexOptions,
  log: (message: string) => void,
): Promise<LabelDocument[]> {
  return fromKnowledgeGraph<LabelDocument[]>(
    options,
    log,
    'labels',
    [],
    async (dkg) => {
      const [terminology, classes] = await Promise.all([
        dkg.readTerminologyLabelQuads(),
        dkg.readClassLabelQuads(),
      ]);
      return [
        ...toLabelDocuments(terminology, 'terminology_source'),
        ...toLabelDocuments(classes, 'class'),
      ];
    },
  );
}

/**
 * CONSTRUCT the DKG enrichment quads (joined later by dataset IRI during
 * framing); degrades to register-only data when the DKG is absent or fails, so a
 * rebuild never depends on DKG availability.
 */
function readKnowledgeGraphQuads(
  options: RunIndexOptions,
  log: (message: string) => void,
): Promise<Quad[]> {
  return fromKnowledgeGraph<Quad[]>(
    options,
    log,
    'enrichment',
    [],
    async (dkg) => {
      const quads = await dkg.readQuads();
      log(`Read ${quads.length} Knowledge Graph enrichment quads`);
      return quads;
    },
  );
}

/**
 * Upsert the cross-lingual synonym groups into the global synonym set (Typesense
 * v30 Synonym Sets API). The set is collection-independent and referenced by
 * name in the collection schema. Synonyms are query-time, so this re-runs
 * idempotently each indexer run with no reindex (per D13a). Wrapped defensively:
 * a synonyms-surface error must never fail an otherwise-good index run.
 */
async function syncSynonyms(
  client: Client,
  log: (message: string) => void,
): Promise<void> {
  try {
    await client.synonymSets(SEARCH_SYNONYM_SET).upsert({
      items: SEARCH_SYNONYMS.map((group, index) => ({
        id: `group-${index}`,
        synonyms: [...group],
      })),
    });
  } catch (error) {
    log(`Synonym sync skipped: ${(error as Error).message}`);
  }
}
