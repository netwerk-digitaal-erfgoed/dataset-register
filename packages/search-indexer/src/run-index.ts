import { Client } from 'typesense';
import {
  createTypesenseClient,
  TypesenseAdapter,
  type TypesenseConnection,
} from '@lde/typesense';
import {
  deriveClassGroups,
  SEARCH_COLLECTION_ALIAS,
  SEARCH_SYNONYM_SET,
  SEARCH_SYNONYMS,
  SparqlClient,
} from '@dataset-register/core';
import type { TypesenseDocument } from '@lde/typesense';
import { buildCollectionSchema } from './collection-schema.js';
import { RegisterSource } from './register-source.js';
import { DkgSource, type DkgEnrichment } from './dkg-source.js';

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

  const iris = await source.enumerateDatasetIris();
  const documents = await source.project(iris);
  await enrichFromKnowledgeGraph(documents, options, log);
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
 * Merge DKG facet enrichment into the projected documents in memory, joined by
 * dataset IRI. Skipped entirely when no DKG endpoint is configured.
 */
async function enrichFromKnowledgeGraph(
  documents: readonly TypesenseDocument[],
  options: RunIndexOptions,
  log: (message: string) => void,
): Promise<void> {
  if (options.knowledgeGraphEndpoint === undefined) {
    return;
  }
  const dkg = new DkgSource(
    new SparqlClient(options.knowledgeGraphEndpoint, options.sparqlAccessToken),
  );

  // DKG-optional: register correctness is the user-facing contract and must
  // always land, so a failed enrichment read degrades to register-only data
  // (DKG facets briefly absent, self-healing on the next successful run) rather
  // than aborting the rebuild.
  let enrichment: Map<string, DkgEnrichment>;
  try {
    enrichment = await dkg.read();
  } catch (error) {
    log(`Knowledge Graph enrichment skipped: ${(error as Error).message}`);
    return;
  }

  for (const document of documents) {
    const entry = enrichment.get(document.id);
    if (entry === undefined) {
      continue;
    }
    if (entry.classes.length > 0) {
      document.class = entry.classes;
      const groups = deriveClassGroups(entry.classes);
      if (groups.length > 0) {
        document.class_group = groups;
      }
    }
    if (entry.terminologySources.length > 0) {
      document.terminology_source = entry.terminologySources;
    }
    if (entry.size !== undefined) {
      document.size = entry.size;
    }
  }
  log(`Enriched ${enrichment.size} datasets from the Knowledge Graph`);
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
