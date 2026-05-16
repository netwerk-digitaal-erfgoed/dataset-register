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
 * Encode a value for embedding inside a URL query string with the smallest
 * possible footprint. The standard `encodeURIComponent` also escapes `:`,
 * `/`, `?` and `@`, which are allowed unencoded in a query value per
 * RFC 3986 §3.4 and just clutter the URL. Encode only what genuinely breaks
 * query parsing:
 * - `%` escape character (encode first so existing `%XX` survive a round-trip)
 * - `&` separates query parameters
 * - `#` starts the fragment
 * - `+` interpreted as space by URLSearchParams (form-urlencoded legacy)
 */
function encodeQueryValue(value: string): string {
  return value
    .replace(/%/g, '%25')
    .replace(/&/g, '%26')
    .replace(/#/g, '%23')
    .replace(/\+/g, '%2B');
}

/**
 * Build the href for a dataset detail page.
 *
 * The dataset IRI lives in a query parameter rather than the path so it
 * survives URL normalisers (Outlook autolinking, Paraglide localisation,
 * Apache `MergeSlashes`, CDN path canonicalisation, …) that mangle the
 * `://` inside a path-embedded URI.
 */
export function datasetDetailHref(uri: string): string {
  return `/dataset?uri=${encodeQueryValue(uri)}`;
}
