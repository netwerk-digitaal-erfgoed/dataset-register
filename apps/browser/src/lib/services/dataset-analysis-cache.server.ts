// Valkey-backed cache for the Dataset Knowledge Graph analysis (see
// DatasetAnalysis). The analysis changes only when the DKG re-crawls a dataset
// (~daily), but the KG queries are intermittently slow on prod (seconds), so a
// shared cache that survives pod restarts turns the repeat views instant.
//
// `.server.ts` keeps the node-only ioredis client out of the browser bundle; the
// cache is injected into fetchDatasetDetail from the server load only.
//
// Design:
//   - Key is namespaced by DATASET_ANALYSIS_SCHEMA_HASH (the structural
//     fingerprint of the DatasetAnalysis type), so a shape change across a deploy
//     yields new keys and old, structurally-incompatible blobs are simply never
//     read — no flush needed, they TTL-expire. See dataset-analysis-schema-hash.ts.
//   - DatasetAnalysis is plain JSON (no Dates), so JSON.stringify/parse is safe.
//   - A per-process in-flight map dedupes concurrent misses for the same dataset
//     into one upstream fetch (stampede protection), complementing the shared cache.
//   - Every Valkey interaction degrades gracefully: if the store is down or a blob
//     is unreadable, we fall back to a direct fetch. The page never breaks on cache.
import Redis from 'ioredis';
import {
  fetchDatasetAnalysis,
  type AnalysisFetcher,
  type DatasetAnalysis,
} from './dataset-detail';
import { DATASET_ANALYSIS_SCHEMA_HASH } from './dataset-analysis-schema-hash';

// The analysis is regenerated ~daily by the DKG; 30 min bounds staleness while
// keeping the store warm. stale-while-revalidate-style refresh is a follow-up.
const TTL_SECONDS = 30 * 60;

const VALKEY_URL = process.env.VALKEY_URL ?? 'redis://localhost:6379';

let redis: Redis | null = null;
function client(): Redis {
  if (redis) return redis;
  redis = new Redis(VALKEY_URL, {
    // Fail fast instead of hanging the page when Valkey is unreachable: no
    // offline queue, a single attempt per command, short connect timeout.
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 1000,
    lazyConnect: false,
    retryStrategy: (attempt) => Math.min(attempt * 500, 5000),
  });
  // ioredis emits 'error' on connection loss; an unhandled 'error' would crash
  // the process, so swallow it (commands still reject and we fall back).
  redis.on('error', () => {
    // intentionally ignored — command rejections drive the fallback
  });
  return redis;
}

function keyFor(datasetUri: string): string {
  return `analysis:${DATASET_ANALYSIS_SCHEMA_HASH}:${datasetUri}`;
}

// Cheap shape guard as a backstop to the schema-hash key: even within a version,
// refuse a blob that does not carry the expected top-level fields.
function isAnalysisShaped(value: unknown): value is DatasetAnalysis {
  return (
    typeof value === 'object' &&
    value !== null &&
    'summary' in value &&
    'linkedData' in value &&
    'linksets' in value &&
    'persistentUris' in value
  );
}

const inFlight = new Map<string, Promise<DatasetAnalysis>>();

// Cache-wrapping analysis fetcher to inject into fetchDatasetDetail. Reads Valkey
// first; on miss (or any cache failure) fetches upstream and populates the store
// best-effort. Concurrent calls for the same dataset share one upstream fetch.
export const cachedFetchAnalysis: AnalysisFetcher = (
  datasetUri,
  distributions,
) => {
  const pending = inFlight.get(datasetUri);
  if (pending) return pending;

  const promise = (async (): Promise<DatasetAnalysis> => {
    const key = keyFor(datasetUri);
    try {
      const raw = await client().get(key);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (isAnalysisShaped(parsed)) return parsed;
      }
    } catch {
      // Valkey down or unreadable blob → fall through to a direct fetch.
    }

    const analysis = await fetchDatasetAnalysis(datasetUri, distributions);

    // Populate best-effort; never let a store failure affect the response.
    client()
      .set(key, JSON.stringify(analysis), 'EX', TTL_SECONDS)
      .catch(() => {
        // best-effort populate — a store failure must not affect the response
      });

    return analysis;
  })().finally(() => inFlight.delete(datasetUri));

  inFlight.set(datasetUri, promise);
  return promise;
};
