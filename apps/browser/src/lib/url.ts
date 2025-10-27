import { page } from '$app/state';

export function decodeRangeParam(name: string): { min?: number; max?: number } {
  const param = page.url.searchParams.get(name);
  const [min, max] = param
    ?.split('-')
    .map((s) => (s ? parseInt(s) : undefined)) ?? [undefined, undefined];

  return { min, max };
}

export function decodeDiscreteParam(name: string) {
  return page.url.searchParams.get(name)?.split(',').filter(Boolean) || [];
}
