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
