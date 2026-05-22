import { describe, expect, it } from 'vitest';
import { GET } from './+server';

function makeEvent(uri: string, pathnamePrefix = '') {
  const encodedUri = uri.replace(/%/g, '%25');
  return {
    params: { uri },
    url: new URL(`http://localhost${pathnamePrefix}/datasets/${encodedUri}`),
  } as unknown as Parameters<typeof GET>[0];
}

function callGet(
  uri: string,
  pathnamePrefix?: string,
): { status: number; location: string } {
  try {
    GET(makeEvent(uri, pathnamePrefix));
    throw new Error(
      'Expected GET to throw a redirect; nothing was thrown for uri=' + uri,
    );
  } catch (thrown) {
    const value = thrown as { status?: number; location?: string };
    if (
      typeof value.status !== 'number' ||
      typeof value.location !== 'string'
    ) {
      throw thrown;
    }
    return { status: value.status, location: value.location };
  }
}

describe('legacy /datasets/[...uri] redirector', () => {
  it('redirects canonical https URLs to /dataset?uri=…', () => {
    const result = callGet(
      'https://data.colonialcollections.nl/nmvw/collection-archives',
    );
    expect(result.status).toBe(308);
    expect(result.location).toBe(
      '/dataset?uri=https://data.colonialcollections.nl/nmvw/collection-archives',
    );
  });

  it('heals an Outlook-collapsed https:/ before redirecting', () => {
    const result = callGet(
      'https:/data.colonialcollections.nl/nmvw/collection-archives',
    );
    expect(result.status).toBe(308);
    expect(result.location).toBe(
      '/dataset?uri=https://data.colonialcollections.nl/nmvw/collection-archives',
    );
  });

  it('heals an Outlook-collapsed http:/ before redirecting', () => {
    const result = callGet('http:/legacy.example/foo');
    expect(result.status).toBe(308);
    expect(result.location).toBe('/dataset?uri=http://legacy.example/foo');
  });

  it('preserves an http:// scheme without coercing to https', () => {
    const result = callGet('http://legacy.example/foo');
    expect(result.status).toBe(308);
    expect(result.location).toBe('/dataset?uri=http://legacy.example/foo');
  });

  it('does not touch anything past the scheme prefix', () => {
    const result = callGet('https://example.org/a//b/c');
    expect(result.status).toBe(308);
    expect(result.location).toBe('/dataset?uri=https://example.org/a//b/c');
  });

  it('throws a 404 for an empty rest parameter', () => {
    let caught: unknown;
    try {
      GET(makeEvent(''));
    } catch (error) {
      caught = error;
    }
    expect((caught as { status?: number } | undefined)?.status).toBe(404);
  });

  it('preserves a locale prefix in the redirect target', () => {
    const result = callGet(
      'https:/linkeddata.cultureelerfgoed.nl/rce/colonialobjects',
      '/en',
    );
    expect(result.status).toBe(308);
    expect(result.location).toBe(
      '/en/dataset?uri=https://linkeddata.cultureelerfgoed.nl/rce/colonialobjects',
    );
  });
});
