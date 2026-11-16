export interface IndexStatistics {
  name: string;
  triples: number;
  subjects: number;
  predicates: number;
  objects: number;
}

export function parseIndexStatistics(value: unknown): IndexStatistics {
  if (!value || typeof value !== 'object')
    throw new Error('Invalid index statistics');
  const data = value as Record<string, unknown>;
  function count(key: string): number {
    const number = data[key];
    if (
      typeof number !== 'number' ||
      !Number.isSafeInteger(number) ||
      number < 0
    )
      throw new Error('Invalid index statistics');
    return number;
  }
  return {
    name: typeof data['name-index'] === 'string' ? data['name-index'] : '',
    triples: count('num-triples-normal'),
    subjects: count('num-subjects-normal'),
    predicates: count('num-predicates-normal'),
    objects: count('num-objects-normal'),
  };
}

export async function fetchIndexStatistics(
  endpoint: string,
  signal: AbortSignal,
): Promise<IndexStatistics> {
  const url = new URL(endpoint);
  url.searchParams.set('cmd', 'stats');
  const response = await fetch(url, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok)
    throw new Error(`Index statistics: HTTP ${response.status}`);
  return parseIndexStatistics(await response.json());
}
