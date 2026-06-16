import { Client } from 'typesense';
import type { CollectionCreateSchema } from 'typesense';
import {
  createTypesenseClient,
  TypesenseAdapter,
  type TypesenseConnection,
  type TypesenseDocument,
} from '@lde/search-typesense';
import { projectGraph } from '@lde/search';
import {
  LABELS_COLLECTION_ALIAS,
  SEARCH_COLLECTION_ALIAS,
  SEARCH_SYNONYM_SET,
  SEARCH_SYNONYMS,
  SparqlClient,
} from '@dataset-register/core';
import type { Quad } from '@rdfjs/types';
import { buildCollectionSchema } from './collection-schema.js';
import { buildLabelCollectionSchema, toLabelDocuments } from './labels.js';
import { RegisterSource } from './register-source.js';
import { DkgSource } from './dkg-source.js';
import { DATASET_PROJECTION } from './projection.js';
import { RebuildLock } from './rebuild-lock.js';
import { runSingleFlight } from './single-flight.js';

const DEFAULT_REGISTRATIONS_GRAPH =
  'https://demo.netwerkdigitaalerfgoed.nl/registry/registrations';

export interface RunIndexOptions {
  readonly sparqlUrl: string;
  readonly sparqlAccessToken?: string;
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

export interface RunIndexResult {
  readonly mode: 'rebuild';
  readonly collection: string;
  readonly upserted: number;
  readonly deleted: number;
}

/**
 * Rebuild the Typesense `datasets` index from the register store.
 *
 * Every run is a full blue/green rebuild: project every registered dataset into
 * a fresh `${alias}_${timestamp}` collection, atomically swap the `datasets`
 * alias to it, then drop the previous collection. Correct by construction — a
 * hard delete needs no special handling (an absent dataset is simply not
 * projected), there is no high-water mark and no incremental reconciliation. On
 * failure nothing is swapped, so a register blip never corrupts the live index.
 */
export async function runIndex(
  options: RunIndexOptions,
): Promise<RunIndexResult> {
  const log = options.log ?? (() => undefined);
  const alias = options.collectionAlias ?? SEARCH_COLLECTION_ALIAS;

  const client = createTypesenseClient(options.typesense);
  const adapter = new TypesenseAdapter(client);
  const source = new RegisterSource(
    new SparqlClient(options.sparqlUrl, options.sparqlAccessToken),
    options.registrationsGraphIri ?? DEFAULT_REGISTRATIONS_GRAPH,
  );

  // Sync the global synonym set before any collection is created — the
  // collection schema references it by name. Idempotent and query-time, so it
  // re-runs each indexer run with no reindex.
  await syncSynonyms(client, log);

  // One timestamp for every collection built this run, so the `datasets_<ts>`
  // and `labels_<ts>` siblings share a suffix and are easy to correlate.
  const timestamp = Date.now();
  const desired = `${alias}_${timestamp}`;

  log(`Rebuilding search index into ${desired}`);

  // Unified read: one CONSTRUCT for the register, one for the DKG, merged by
  // dataset IRI into a single RDF graph, then framed per dataset into the
  // JSON-LD IR and projected. DKG quads are optional (see below).
  const registerQuads = await source.readQuads();
  const dkgQuads = await readKnowledgeGraphQuads(options, log);
  const documents = await projectDatasets([...registerQuads, ...dkgQuads]);
  await blueGreenSwap(
    adapter,
    alias,
    buildCollectionSchema(desired),
    documents,
  );
  log(`Indexed ${documents.length} datasets; alias ${alias} → ${desired}`);

  // Sidecar IRI → label collection for facet-bucket display, rebuilt the same
  // blue/green way. Non-critical: a label failure must never abort the
  // user-facing dataset index (which is already live by now), so it degrades to
  // the previous labels and self-heals next run.
  const labelsAlias = options.labelsAlias ?? LABELS_COLLECTION_ALIAS;
  await rebuildLabels(adapter, source, labelsAlias, timestamp, log);

  return {
    mode: 'rebuild',
    collection: desired,
    upserted: documents.length,
    deleted: 0,
  };
}

/**
 * Blue/green-publish a freshly built collection: create it, bulk-upsert the
 * documents, atomically repoint `alias` to it, then drop whatever the alias
 * superseded. On failure nothing is swapped, so the live alias is never
 * corrupted by a partial build.
 */
async function blueGreenSwap(
  adapter: TypesenseAdapter,
  alias: string,
  schema: CollectionCreateSchema,
  documents: readonly TypesenseDocument[],
): Promise<void> {
  const previous = await adapter.aliasTarget(alias);
  await adapter.createCollection(schema);
  await adapter.bulkUpsert(schema.name, documents);
  await adapter.swapAlias(alias, schema.name);
  if (previous !== undefined && previous !== schema.name) {
    await adapter.deleteCollection(previous).catch(() => undefined);
  }
}

/**
 * Build the sidecar `labels` collection (organization IRIs → `foaf:name`) and
 * blue/green-swap its alias. Defensive: a failure here is logged and swallowed
 * so it never fails an otherwise-good dataset rebuild — labels are display-only
 * and the browser falls back to a shortened IRI when one is missing.
 */
async function rebuildLabels(
  adapter: TypesenseAdapter,
  source: RegisterSource,
  alias: string,
  timestamp: number,
  log: (message: string) => void,
): Promise<void> {
  try {
    const documents = toLabelDocuments(
      await source.readOrganizationLabelQuads(),
      'organization',
    );
    const desired = `${alias}_${timestamp}`;
    await blueGreenSwap(
      adapter,
      alias,
      buildLabelCollectionSchema(desired),
      documents,
    );
    log(`Indexed ${documents.length} labels; alias ${alias} → ${desired}`);
  } catch (error) {
    log(`Label index skipped: ${(error as Error).message}`);
  }
}

/**
 * Run a rebuild under the cross-pod single-flight lock. The crawler and every
 * API pod call this so only one rebuild runs at a time across all replicas, and
 * a trigger arriving mid-rebuild coalesces into one follow-up. Returns nothing:
 * triggers are fire-and-forget and a coalesced or skipped call has no result.
 */
export async function runIndexSingleFlight(
  options: RunIndexOptions,
): Promise<void> {
  const lock = new RebuildLock(createTypesenseClient(options.typesense));
  await runSingleFlight(lock, async () => {
    await runIndex(options);
  });
}

/**
 * Frame the merged register + DKG quads and project each node into a Typesense
 * document, driven by the dataset projection. Streamed (one frame at a time) so
 * memory stays flat — whole-graph framing is ~O(N²).
 */
async function projectDatasets(quads: Quad[]): Promise<TypesenseDocument[]> {
  const documents: TypesenseDocument[] = [];
  for await (const document of projectGraph(quads, [DATASET_PROJECTION])) {
    documents.push(document);
  }
  return documents;
}

/**
 * CONSTRUCT the DKG enrichment quads (joined later by dataset IRI during
 * framing). DKG-optional: register correctness is the user-facing contract and
 * must always land, so a failed or absent DKG read degrades to register-only
 * data (DKG facets briefly absent, self-healing on the next successful run)
 * rather than aborting the rebuild.
 */
async function readKnowledgeGraphQuads(
  options: RunIndexOptions,
  log: (message: string) => void,
): Promise<Quad[]> {
  if (options.knowledgeGraphEndpoint === undefined) {
    return [];
  }
  const dkg = new DkgSource(
    new SparqlClient(options.knowledgeGraphEndpoint, options.sparqlAccessToken),
  );
  try {
    const quads = await dkg.readQuads();
    log(`Read ${quads.length} Knowledge Graph enrichment quads`);
    return quads;
  } catch (error) {
    log(`Knowledge Graph enrichment skipped: ${(error as Error).message}`);
    return [];
  }
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
