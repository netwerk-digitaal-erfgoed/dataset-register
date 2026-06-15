import { Client } from 'typesense';
import {
  createTypesenseClient,
  TypesenseAdapter,
  type TypesenseConnection,
} from '@lde/typesense';
import {
  SEARCH_COLLECTION_ALIAS,
  SEARCH_SYNONYM_SET,
  SEARCH_SYNONYMS,
  SparqlClient,
} from '@dataset-register/core';
import type { TypesenseDocument } from '@lde/typesense';
import type { Quad } from '@rdfjs/types';
import { buildCollectionSchema } from './collection-schema.js';
import { RegisterSource } from './register-source.js';
import { DkgSource } from './dkg-source.js';
import { frameDatasets } from './frame.js';
import { framedDatasetToRaw } from './framed.js';
import { buildDocument } from './projection.js';
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

  const desired = `${alias}_${Date.now()}`;
  const previous = await adapter.aliasTarget(alias);

  log(`Rebuilding search index into ${desired}`);
  await adapter.createCollection(buildCollectionSchema(desired));

  // Unified read: one CONSTRUCT for the register, one for the DKG, merged by
  // dataset IRI into a single RDF graph, then framed per dataset into the
  // JSON-LD IR and projected. DKG quads are optional (see below).
  const registerQuads = await source.readQuads();
  const dkgQuads = await readKnowledgeGraphQuads(options, log);
  const documents = await projectDatasets([...registerQuads, ...dkgQuads]);
  await adapter.bulkUpsert(desired, documents);
  await adapter.swapAlias(alias, desired);
  log(`Indexed ${documents.length} datasets; alias ${alias} → ${desired}`);

  // Drop the superseded collection once the alias safely points elsewhere.
  if (previous !== undefined && previous !== desired) {
    await adapter.deleteCollection(previous).catch(() => undefined);
  }

  return {
    mode: 'rebuild',
    collection: desired,
    upserted: documents.length,
    deleted: 0,
  };
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
 * Frame the merged register + DKG quads into one JSON-LD IR node per dataset and
 * project each into a Typesense document. Streamed (one frame at a time) so
 * memory stays flat — whole-graph framing is ~O(N²).
 */
async function projectDatasets(quads: Quad[]): Promise<TypesenseDocument[]> {
  const documents: TypesenseDocument[] = [];
  for await (const node of frameDatasets(quads)) {
    documents.push(buildDocument(framedDatasetToRaw(node)));
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
