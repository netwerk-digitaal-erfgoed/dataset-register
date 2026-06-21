import { describe, expect, it } from 'vitest';
import {
  isIiifMet,
  isLinkedDataMet,
  isPersistentUrisMet,
  isSchemaApNdeMet,
  isTermsMet,
} from '../src/search/index.ts';

describe('isIiifMet', () => {
  it('is not met when no manifests are declared', () => {
    expect(isIiifMet({ declared: 0, sampled: null, validated: null })).toBe(
      false,
    );
  });

  it('is met when a sampled manifest validated', () => {
    expect(isIiifMet({ declared: 3, sampled: 3, validated: 2 })).toBe(true);
  });

  it('is met when declared but not yet sampled', () => {
    expect(isIiifMet({ declared: 3, sampled: null, validated: null })).toBe(
      true,
    );
  });

  it('is not met when sampled but none validated', () => {
    expect(isIiifMet({ declared: 3, sampled: 3, validated: 0 })).toBe(false);
  });
});

describe('isSchemaApNdeMet', () => {
  it('is met when quads validated and the sample conformed', () => {
    expect(isSchemaApNdeMet({ quadsValidated: 10, conformant: true })).toBe(
      true,
    );
  });

  it('is not met when no quads validated, even if conformant is true', () => {
    expect(isSchemaApNdeMet({ quadsValidated: 0, conformant: true })).toBe(
      false,
    );
  });

  it('is not met when the sample did not conform', () => {
    expect(isSchemaApNdeMet({ quadsValidated: 10, conformant: false })).toBe(
      false,
    );
  });

  it('is not met when no measurement exists', () => {
    expect(isSchemaApNdeMet({ quadsValidated: null, conformant: null })).toBe(
      false,
    );
  });
});

describe('isLinkedDataMet', () => {
  it('is met when content is present and conformance is proven', () => {
    expect(
      isLinkedDataMet({ triples: 100, quadsValidated: 10, conformant: true }),
    ).toBe(true);
  });

  it('is not met without content even when conformant', () => {
    expect(
      isLinkedDataMet({ triples: 0, quadsValidated: 10, conformant: true }),
    ).toBe(false);
    expect(
      isLinkedDataMet({ triples: null, quadsValidated: 10, conformant: true }),
    ).toBe(false);
  });

  it('is not met when content is present but conformance is not proven', () => {
    expect(
      isLinkedDataMet({ triples: 100, quadsValidated: 0, conformant: true }),
    ).toBe(false);
  });
});

describe('isTermsMet', () => {
  it('is met with at least one terminology source', () => {
    expect(isTermsMet(1)).toBe(true);
  });

  it('is not met with no terminology sources', () => {
    expect(isTermsMet(0)).toBe(false);
  });
});

describe('isPersistentUrisMet', () => {
  it('is met when all sampled URIs resolved on a durable namespace', () => {
    expect(
      isPersistentUrisMet({ sampled: 5, resolved: 5, durable: true }),
    ).toBe(true);
  });

  it('is not met when not every sampled URI resolved', () => {
    expect(
      isPersistentUrisMet({ sampled: 5, resolved: 4, durable: true }),
    ).toBe(false);
  });

  it('is not met on a non-durable namespace even when all resolved', () => {
    expect(
      isPersistentUrisMet({ sampled: 5, resolved: 5, durable: false }),
    ).toBe(false);
  });

  it('is not met when nothing was sampled', () => {
    expect(
      isPersistentUrisMet({ sampled: 0, resolved: 0, durable: true }),
    ).toBe(false);
    expect(
      isPersistentUrisMet({ sampled: null, resolved: null, durable: true }),
    ).toBe(false);
  });
});
