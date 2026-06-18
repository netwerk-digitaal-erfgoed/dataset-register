import { Client } from 'typesense';
import { rebuild } from '@lde/search-typesense';
import { projectGraph, type SearchDocument } from '@lde/search';
import {
  LABELS_COLLECTION_ALIAS,
  SEARCH_COLLECTION_ALIAS,
  SEARCH_SYNONYM_SET,
  SEARCH_SYNONYMS,
  SparqlClient,
} from '@dataset-register/core';
import type { Quad } from '@rdfjs/types';
import { buildCollectionSchema } from './collection-schema.js';
import {
  buildLabelCollectionSchema,
  toLabelDocuments,
  type LabelDocument,
} from './labels.js';
import { RegisterSource } from './register-source.js';
import { DkgSource } from './dkg-source.js';
import { DATASET_PROJECTION } from './projection.js';
import {
  createTypesenseClient,
  type TypesenseConnection,
} from './typesense-client.js';

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

export type RunIndexResult =
  | {
      readonly mode: 'rebuild';
      readonly collection: string;
      readonly upserted: number;
    }
  /** Another rebuild for this index was already in flight, so this run was a no-op. */
  | { readonly mode: 'skipped' };

/**
 * Rebuild the Typesense `datasets` index from the register store.
 *
 * Every run is a full blue/green rebuild, delegated to `@lde/search-typesense`’s
 * {@link rebuild}: it projects every registered dataset into a fresh
 * `${alias}_${timestamp}` collection, atomically swaps the `datasets` alias to
 * it, then drops the previous collection. Correct by construction — a hard
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
    new SparqlClient(options.sparqlUrl, options.sparqlAccessToken),
    options.registrationsGraphIri ?? DEFAULT_REGISTRATIONS_GRAPH,
  );

  // Sync the global synonym set before any collection is created — the
  // collection schema references it by name. Idempotent and query-time, so it
  // re-runs each indexer run with no reindex.
  await syncSynonyms(client, log);

  log(`Rebuilding search index ${alias}`);

  // Unified read: one CONSTRUCT for the register, one for the DKG, merged by
  // dataset IRI into a single RDF graph, then framed per dataset into the
  // JSON-LD IR and projected — streamed straight into the rebuild so only one
  // document is held at a time. DKG quads are optional (see below). The
  // versioned collection name, alias swap and cross-pod lock are managed by
  // {@link rebuild}; the caller supplies only the logical alias.
  const registerQuads = await source.readQuads();
  const dkgQuads = await readKnowledgeGraphQuads(options, log);
  const result = await rebuild(
    client,
    buildCollectionSchema(alias),
    projectGraph([...registerQuads, ...dkgQuads], [DATASET_PROJECTION]),
  );
  if (result === null) {
    log(`Rebuild of ${alias} skipped: another rebuild is already running`);
    return { mode: 'skipped' };
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
 * Build the sidecar `labels` collection — organization IRIs (`foaf:name`) from
 * the register plus terminology-source (`dct:title`) and class (`rdfs:label`)
 * labels from the DKG — and blue/green-swap its alias via {@link rebuild}.
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
 * Read the DKG-sourced facet labels (terminology sources, classes) as label
 * documents. DKG-optional, exactly like the dataset enrichment: an absent
 * endpoint or a failed read degrades to register-only (organization) labels
 * rather than losing the whole labels collection.
 */
async function readKnowledgeGraphLabels(
  options: RunIndexOptions,
  log: (message: string) => void,
): Promise<LabelDocument[]> {
  if (options.knowledgeGraphEndpoint === undefined) {
    return [];
  }
  const dkg = new DkgSource(
    new SparqlClient(options.knowledgeGraphEndpoint, options.sparqlAccessToken),
  );
  try {
    const [terminology, classes] = await Promise.all([
      dkg.readTerminologyLabelQuads(),
      dkg.readClassLabelQuads(),
    ]);
    return [
      ...toLabelDocuments(terminology, 'terminology_source'),
      ...toLabelDocuments(classes, 'class'),
    ];
  } catch (error) {
    log(`Knowledge Graph labels skipped: ${(error as Error).message}`);
    return [];
  }
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

/** Adapt a materialized document array to the async iterable {@link rebuild} consumes. */
async function* iterate(
  documents: readonly SearchDocument[],
): AsyncIterable<SearchDocument> {
  for (const document of documents) {
    yield document;
  }
}
