import { describe, expect, it } from 'vitest';
import { fetchErrorReason } from './validation.js';

describe('fetchErrorReason', () => {
  it('extracts the reason from a CouldNotFetchUrl title', () => {
    expect(
      fetchErrorReason(
        'Could not fetch URL https://example.com/loop: redirect count exceeded',
      ),
    ).toBe('redirect count exceeded');
  });

  it('handles URLs containing colons (e.g. ports)', () => {
    expect(
      fetchErrorReason(
        'Could not fetch URL https://example.com:8080/x: redirect count exceeded',
      ),
    ).toBe('redirect count exceeded');
  });

  it('returns undefined for unrelated titles', () => {
    expect(
      fetchErrorReason('No dataset found at URL https://example.com'),
    ).toBeUndefined();
  });

  it('returns undefined when no title is given', () => {
    expect(fetchErrorReason(undefined)).toBeUndefined();
  });
});
