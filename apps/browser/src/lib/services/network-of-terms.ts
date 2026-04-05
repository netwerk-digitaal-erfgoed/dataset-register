const ENDPOINT = 'https://termennetwerk-api.netwerkdigitaalerfgoed.nl/graphql';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 1 day
const LANGUAGES = ['nl', 'en'] as const;

type Language = (typeof LANGUAGES)[number];

interface CacheEntry {
  labels: Partial<Record<Language, string>>;
  timestamp: number;
}

const termLabelCache = new Map<string, CacheEntry>();

export function isUri(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://');
}

/**
 * Look up term URIs via the Network of Terms API and return labels in the
 * requested locale, falling back to other available languages. Results are
 * cached in memory for 24 hours. URIs with no labels are cached as an empty
 * object to avoid repeated lookups.
 */
export async function lookupTermLabels(
  uris: string[],
  locale: string,
): Promise<Record<string, string>> {
  const preferredLanguage = (LANGUAGES as readonly string[]).includes(locale)
    ? (locale as Language)
    : 'nl';
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
    if (!entry) continue;
    const label = pickLabel(entry.labels, preferredLanguage);
    if (label) {
      resolved[uri] = label;
    }
  }
  return resolved;
}

function pickLabel(
  labels: Partial<Record<Language, string>>,
  locale: Language,
): string | undefined {
  if (labels[locale]) return labels[locale];
  for (const language of LANGUAGES) {
    if (labels[language]) return labels[language];
  }
  return undefined;
}

interface LookupResponse {
  data?: {
    lookup: Array<{
      uri: string;
      result:
        | {
            __typename: 'TranslatedTerm';
            prefLabel: Array<{ value: string; language: Language }>;
          }
        | { __typename: string };
    }>;
  };
}

async function fetchAndCacheLabels(uris: string[]): Promise<void> {
  const languagesArg = LANGUAGES.join(', ');
  const urisArg = uris.map((uri) => `"${uri}"`).join(', ');
  const query = `{
    lookup(uris: [${urisArg}], languages: [${languagesArg}]) {
      uri
      result {
        __typename
        ... on TranslatedTerm { prefLabel { value language } }
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
    const labels: Partial<Record<Language, string>> = {};
    if (
      entry.result.__typename === 'TranslatedTerm' &&
      'prefLabel' in entry.result
    ) {
      for (const { value, language } of entry.result.prefLabel) {
        // Keep first occurrence per language.
        if (!labels[language]) {
          labels[language] = value;
        }
      }
    }
    termLabelCache.set(entry.uri, { labels, timestamp: now });
  }

  // Cache URIs that weren't in the response to avoid re-fetching.
  for (const uri of uris) {
    if (!termLabelCache.has(uri)) {
      termLabelCache.set(uri, { labels: {}, timestamp: now });
    }
  }
}
