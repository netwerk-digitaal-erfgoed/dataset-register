import { describe, expect, it } from 'vitest';
import { DataFactory } from 'n3';
import type { Quad } from '@rdfjs/types';
import { prepareLabelQuads } from '../src/label-collections.ts';

const { namedNode, literal, quad } = DataFactory;

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const FOAF_NAME = 'http://xmlns.com/foaf/0.1/name';
const ORGANIZATION = 'https://schema.org/Organization';

const name = (iri: string, value: string, language?: string): Quad =>
  quad(
    namedNode(iri),
    namedNode(FOAF_NAME),
    language === undefined ? literal(value) : literal(value, language),
  );

/** The `@language`-tagged label values a subject carries after preparation. */
function labelsOf(
  prepared: readonly Quad[],
  iri: string,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const preparedQuad of prepared) {
    if (
      preparedQuad.subject.value === iri &&
      preparedQuad.object.termType === 'Literal'
    ) {
      result[preparedQuad.object.language] = preparedQuad.object.value;
    }
  }
  return result;
}

/** Whether the prepared quads type `iri` as an instance of `ORGANIZATION`. */
function isTyped(prepared: readonly Quad[], iri: string): boolean {
  return prepared.some(
    (preparedQuad) =>
      preparedQuad.subject.value === iri &&
      preparedQuad.predicate.value === RDF_TYPE &&
      preparedQuad.object.value === ORGANIZATION,
  );
}

describe('prepareLabelQuads', () => {
  it('injects an rdf:type triple per distinct subject', () => {
    const prepared = prepareLabelQuads(
      [name('urn:org:a', 'A'), name('urn:org:b', 'B')],
      ORGANIZATION,
    );
    expect(isTyped(prepared, 'urn:org:a')).toBe(true);
    expect(isTyped(prepared, 'urn:org:b')).toBe(true);
  });

  it('re-tags an untagged label into both locales', () => {
    const prepared = prepareLabelQuads(
      [name('urn:org:kb', 'KB')],
      ORGANIZATION,
    );
    expect(labelsOf(prepared, 'urn:org:kb')).toEqual({ nl: 'KB', en: 'KB' });
  });

  it('keeps each language when both nl and en are present', () => {
    const prepared = prepareLabelQuads(
      [
        name('urn:org:x', 'Bibliotheek', 'nl'),
        name('urn:org:x', 'Library', 'en'),
      ],
      ORGANIZATION,
    );
    expect(labelsOf(prepared, 'urn:org:x')).toEqual({
      nl: 'Bibliotheek',
      en: 'Library',
    });
  });

  it('falls back to the other locale for a missing one (en-only)', () => {
    const prepared = prepareLabelQuads(
      [name('urn:class:person', 'Person', 'en')],
      ORGANIZATION,
    );
    expect(labelsOf(prepared, 'urn:class:person')).toEqual({
      nl: 'Person',
      en: 'Person',
    });
  });

  it('falls back to a foreign-language-only label for both locales', () => {
    // A subject labelled solely in a language other than nl/en (e.g. a French
    // vocabulary) must still resolve, not render as a bare IRI.
    const prepared = prepareLabelQuads(
      [name('urn:voc:fr', 'Thésaurus', 'fr')],
      ORGANIZATION,
    );
    expect(labelsOf(prepared, 'urn:voc:fr')).toEqual({
      nl: 'Thésaurus',
      en: 'Thésaurus',
    });
  });

  it('falls back to the other locale for a missing one (nl-only)', () => {
    const prepared = prepareLabelQuads(
      [name('urn:org:y', 'Rijksmuseum', 'nl')],
      ORGANIZATION,
    );
    expect(labelsOf(prepared, 'urn:org:y')).toEqual({
      nl: 'Rijksmuseum',
      en: 'Rijksmuseum',
    });
  });

  it('prefers the tagged value over the untagged one for that locale', () => {
    const prepared = prepareLabelQuads(
      [name('urn:org:z', 'Untagged'), name('urn:org:z', 'Getagd', 'nl')],
      ORGANIZATION,
    );
    // nl takes the @nl value; en has no @en value so it falls back (nl → en →
    // untagged), which is the @nl value.
    expect(labelsOf(prepared, 'urn:org:z')).toEqual({
      nl: 'Getagd',
      en: 'Getagd',
    });
  });

  it('keeps the first value seen per language', () => {
    const prepared = prepareLabelQuads(
      [name('urn:org:w', 'First', 'nl'), name('urn:org:w', 'Second', 'nl')],
      ORGANIZATION,
    );
    expect(labelsOf(prepared, 'urn:org:w').nl).toBe('First');
  });

  it('ignores non-literal objects', () => {
    const prepared = prepareLabelQuads(
      [
        quad(
          namedNode('urn:org:iri'),
          namedNode(FOAF_NAME),
          namedNode('urn:not:a:label'),
        ),
      ],
      ORGANIZATION,
    );
    expect(prepared).toEqual([]);
  });
});
