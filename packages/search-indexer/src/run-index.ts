import { Client } from 'typesense';
import { rebuild, buildCollectionSchema } from '@lde/search-typesense';
import { projectGraph, type SearchDocument } from '@lde/search';
import {
  DATASET,
  DATASET_DEFAULT_SORTING_FIELD,
  DEFAULT_REGISTRATIONS_GRAPH,
  LABELS_COLLECTION_ALIAS,
  SEARCH_COLLECTION_ALIAS,
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
 * swapped for an enrichment-less one (see {@link runIndex}).
 */
export type SkipReason = 'concurrent-rebuild' | 'empty-knowledge-graph';

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
 * {@link rebuild}: it projects every registered dataset into a fresh
 * `${alias}_${timestamp}` collection, atomically swaps the `datasets` alias to
 * it, then drops the previous collection. Correct by construction – a hard
 * delete needs no special handling (an absent dataset is simply not projected),
 * there is no high-water mark and no incremental reconciliation. On failure
 * nothing is swapped, so a register blip never corrupts the live index.
 *
 * {@link rebuild} is single-flight per index (it holds a cross-pod lock in
 * Typesense), so the crawler and every API pod can trigger this concurrently and
 * only one rebuild runs at a time; a trigger arriving mid-rebuild is skipped
 * rather than queued, and `mode: 'skipped'` is returned.
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

  // Sync the global synonym set before any collection is created – the
  // collection schema references it by name. Idempotent and query-time, so it
  // re-runs each indexer run with no reindex.
  await syncSynonyms(client, log);

  log(`Rebuilding search index ${alias}`);

  // Unified read: one CONSTRUCT for the register, one for the DKG, merged by
  // dataset IRI into a single RDF graph, then framed per dataset into the
  // JSON-LD IR and projected – streamed straight into the rebuild so only one
  // document is held at a time. DKG quads are optional (see below). The
  // versioned collection name, alias swap and cross-pod lock are managed by
  // {@link rebuild}; the caller supplies only the logical alias.
  // The register and DKG reads are independent (different endpoints), so run
  // them concurrently.
  const [registerQuads, dkgQuads] = await Promise.all([
    source.readQuads(),
    readKnowledgeGraphQuads(options, log),
  ]);

  // Guard a transient or empty Knowledge Graph from stripping every facet off the
  // live index. The rebuild is a full blue/green swap, so projecting register data
  // with no DKG enrichment would atomically replace a good, enriched index with an
  // enrichment-less one for every dataset at once (no terminology-source facet, no
  // Linked Data summary class data). When a DKG endpoint is configured but returned
  // nothing — unreachable, or reduced to a bootstrap-only store — while the
  // register has data and a live index already exists, keep that index instead of
  // swapping. A run with no DKG endpoint configured, or a cold start with no index
  // yet, still proceeds register-only. The next run self-heals once the DKG is
  // back. (See dataset-knowledge-graph#385, which makes the DKG fail loudly rather
  // than serve empty.)
  if (
    options.knowledgeGraphEndpoint !== undefined &&
    dkgQuads.length === 0 &&
    registerQuads.length > 0 &&
    (await collectionExists(client, alias))
  ) {
    log(
      `Rebuild of ${alias} skipped: the Knowledge Graph returned no enrichment; keeping the current index to avoid stripping facets`,
    );
    return { mode: 'skipped', reason: 'empty-knowledge-graph' };
  }

  const result = await rebuild(
    client,
    buildCollectionSchema(DATASET, {
      name: alias,
      defaultSortingField: DATASET_DEFAULT_SORTING_FIELD,
      defaultLocale: 'nl',
      synonymSets: [SEARCH_SYNONYM_SET],
    }),
    projectGraph([...registerQuads, ...dkgQuads], [DATASET]),
  );
  if (result === null) {
    log(`Rebuild of ${alias} skipped: another rebuild is already running`);
    return { mode: 'skipped', reason: 'concurrent-rebuild' };
  }
  log(
    `Indexed ${result.imported} datasets; alias ${alias} → ${result.collection}`,
  );

  // Sidecar IRI → label collection for facet-bucket display, rebuilt the same
  // blue/green way. Non-critical: a label failure must never abort the
  // user-facing dataset index (which is already live by now), so it degrades to
  // the previous labels and self-heals next run.
  const labelsAlias = options.labelsAlias ?? LABELS_COLLECTION_ALIAS;
  await rebuildLabels(client, source, options, labelsAlias, log);

  return {
    mode: 'rebuild',
    collection: result.collection,
    upserted: result.imported,
  };
}

/**
 * Whether the search alias already resolves to a live collection. Distinguishes a
 * cold start (no index yet) from a populated one: an empty Knowledge Graph read
 * only warrants keeping the current index when there is one to keep, so a first
 * run still builds register-only rather than skipping into an empty search.
 */
async function collectionExists(
  client: Client,
  alias: string,
): Promise<boolean> {
  try {
    await client.aliases(alias).retrieve();
    return true;
  } catch {
    return false;
  }
}

/**
 * Build the sidecar `labels` collection:  organization IRIs (`foaf:name`) from
 * the register plus term IRIs and labels (`dct:title`) and class (`rdfs:label`)
 * from the DKG. Blue/green-swap its alias via {@link rebuild}.
 * Defensive: a failure here is logged and swallowed so it never fails an
 * otherwise-good dataset rebuild; labels are display-only and the browser falls
 * back to a shortened IRI when one is missing. The DKG labels are independently
 * optional (see below).
 */
async function rebuildLabels(
  client: Client,
  source: RegisterSource,
  options: RunIndexOptions,
  alias: string,
  log: (message: string) => void,
): Promise<void> {
  try {
    const documents = toLabelDocuments(
      await source.readOrganizationLabelQuads(),
      'organization',
    );
    documents.push(...(await readKnowledgeGraphLabels(options, log)));
    const result = await rebuild(
      client,
      buildLabelCollectionSchema(alias),
      iterate(documents),
    );
    if (result === null) {
      log('Label index skipped: another rebuild is already running');
      return;
    }
    log(
      `Indexed ${result.imported} labels; alias ${alias} → ${result.collection}`,
    );
  } catch (error) {
    log(`Label index skipped: ${(error as Error).message}`);
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

/** Adapt a materialized document array to the async iterable {@link rebuild} consumes. */
async function* iterate(
  documents: readonly SearchDocument[],
): AsyncIterable<SearchDocument> {
  for (const document of documents) {
    yield document;
  }
}
