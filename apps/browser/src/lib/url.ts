import { page } from '$app/state';

export function decodeRangeParam(
  name: string,
  urlSearchParams: URLSearchParams = page.url.searchParams,
): { min?: number; max?: number } {
  const param = urlSearchParams.get(name);
  const [min, max] = param
    ?.split('-')
    .map((s) => (s ? parseInt(s) : undefined)) ?? [undefined, undefined];

  return { min, max };
}

export function decodeDiscreteParam(
  name: string,
  urlSearchParams: URLSearchParams = page.url.searchParams,
) {
  return urlSearchParams.get(name)?.split(',').filter(Boolean) || [];
}

/**
 * Encode a dataset URI for use in URLs.
 * Only encodes characters that would cause issues:
 * - % (preserves existing percent-encoded sequences)
 * - # (prevents browser fragment interpretation)
 *
 * Uses minimal encoding instead of encodeURIComponent to keep URLs human-readable.
 */
export function encodeDatasetUri(uri: string): string {
  return uri.replace(/%/g, '%25').replace(/#/g, '%23');
}
