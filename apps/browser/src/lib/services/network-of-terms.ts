const ENDPOINT = 'https://termennetwerk-api.netwerkdigitaalerfgoed.nl/graphql';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 1 day

interface CacheEntry {
  label: string | null;
  timestamp: number;
}

const termLabelCache = new Map<string, CacheEntry>();

export function isUri(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://');
}

/**
 * Look up term URIs via the Network of Terms API and return resolved labels.
 * Results are cached in memory for 24 hours. URIs that the API does not
 * recognise are cached as null to avoid repeated lookups.
 */
export async function lookupTermLabels(
  uris: string[],
): Promise<Record<string, string>> {
  const now = Date.now();
  const uniqueUris = [...new Set(uris)];
  const uncachedUris = uniqueUris.filter((uri) => {
    const entry = termLabelCache.get(uri);
    return !entry || now - entry.timestamp > CACHE_TTL_MS;
  });

  if (uncachedUris.length > 0) {
    try {
      await fetchAndCacheLabels(uncachedUris);
    } catch (error) {
      console.error(
        'Network of Terms lookup failed:',
        error instanceof Error ? error.message : error,
      );
    }
  }

  const resolved: Record<string, string> = {};
  for (const uri of uniqueUris) {
    const entry = termLabelCache.get(uri);
    if (entry?.label) {
      resolved[uri] = entry.label;
    }
  }
  return resolved;
}

interface LookupResponse {
  data?: {
    lookup: Array<{
      uri: string;
      result:
        | { __typename: 'Term'; prefLabel: string[] }
        | { __typename: string; message?: string };
    }>;
  };
}

async function fetchAndCacheLabels(uris: string[]): Promise<void> {
  const query = `{
    lookup(uris: [${uris.map((uri) => `"${uri}"`).join(', ')}]) {
      uri
      result {
        __typename
        ... on Term { prefLabel }
      }
    }
  }`;

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const body = (await response.json()) as LookupResponse;
  const now = Date.now();

  for (const entry of body.data?.lookup ?? []) {
    const label =
      entry.result.__typename === 'Term' &&
      'prefLabel' in entry.result &&
      entry.result.prefLabel.length > 0
        ? entry.result.prefLabel[0]
        : null;
    termLabelCache.set(entry.uri, { label, timestamp: now });
  }

  // Also cache URIs that weren't in the response at all (shouldn't happen, but be safe).
  for (const uri of uris) {
    if (!termLabelCache.has(uri)) {
      termLabelCache.set(uri, { label: null, timestamp: now });
    }
  }
}
