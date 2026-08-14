import { describe, expect, it } from 'vitest';
import { DATASET_TYPE, SEARCH_SCHEMA } from '@dataset-register/core';
import { irAliasOf, rootTypeOf } from '../src/ir-alias.ts';

const DATASET = rootTypeOf(SEARCH_SCHEMA, DATASET_TYPE);

describe('rootTypeOf', () => {
  it('resolves a declared type by its class IRI', () => {
    expect(rootTypeOf(SEARCH_SCHEMA, DATASET_TYPE).name).toBe('Dataset');
  });

  it('throws on a class the schema does not declare', () => {
    expect(() => rootTypeOf(SEARCH_SCHEMA, 'urn:nope')).toThrow('urn:nope');
  });
});

describe('irAliasOf', () => {
  it('mints the alias a reader emits a field under', () => {
    expect(irAliasOf(DATASET, 'title')).toBe('<urn:lde:Dataset/title>');
  });

  it('mints one for an internal field too', () => {
    // Internal fields carry the raw predicates the derives read; they are
    // projected and then pruned, so the reader must emit them like any other.
    expect(irAliasOf(DATASET, 'class_iri')).toBe(
      '<urn:lde:Dataset/class_iri>',
    );
  });

  it('throws on a field the type does not declare', () => {
    // The guard that makes a renamed field fail where the query is built,
    // rather than silently projecting nothing into that facet.
    expect(() => irAliasOf(DATASET, 'publisher_name')).toThrow(
      'publisher_name',
    );
  });
});
