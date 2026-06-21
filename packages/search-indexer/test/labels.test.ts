import { describe, expect, it } from 'vitest';
import { Parser } from 'n3';
import { buildLabelCollectionSchema, toLabelDocuments } from '../src/labels.ts';

/** Parse a Turtle snippet into the quad array the builder consumes. */
function quads(turtle: string) {
  return new Parser().parse(
    `@prefix foaf: <http://xmlns.com/foaf/0.1/> .\n${turtle}`,
  );
}

describe('toLabelDocuments', () => {
  it('keys one label document per IRI, carrying the source type', () => {
    const documents = toLabelDocuments(
      quads(`
        <https://example.org/org/kb> foaf:name "Koninklijke Bibliotheek" .
        <https://example.org/org/na> foaf:name "Nationaal Archief" .
      `),
      'organization',
    );
    expect(documents).toHaveLength(2);
    expect(documents).toContainEqual({
      id: 'https://example.org/org/kb',
      label: 'Koninklijke Bibliotheek',
      type: 'organization',
    });
    expect(documents).toContainEqual({
      id: 'https://example.org/org/na',
      label: 'Nationaal Archief',
      type: 'organization',
    });
  });

  it('splits language-tagged labels per locale with a default fallback', () => {
    const [document] = toLabelDocuments(
      quads(`
        <https://example.org/org/kb> foaf:name "Koninklijke Bibliotheek"@nl ;
          foaf:name "Royal Library"@en .
      `),
      'organization',
    );
    expect(document.label_nl).toBe('Koninklijke Bibliotheek');
    expect(document.label_en).toBe('Royal Library');
    // Dutch is the default-display fallback.
    expect(document.label).toBe('Koninklijke Bibliotheek');
  });

  it('falls back to English, then any value, when Dutch is absent', () => {
    const [enOnly] = toLabelDocuments(
      quads(`<https://example.org/a> foaf:name "Only English"@en .`),
      'organization',
    );
    expect(enOnly.label).toBe('Only English');

    const [plainOnly] = toLabelDocuments(
      quads(`<https://example.org/b> foaf:name "Plain" .`),
      'organization',
    );
    expect(plainOnly.label).toBe('Plain');
  });

  it('ignores non-literal objects (only literal names become labels)', () => {
    const documents = toLabelDocuments(
      quads(`
        <https://example.org/org/kb> foaf:homepage <https://kb.nl> ;
          foaf:name "Koninklijke Bibliotheek" .
      `),
      'organization',
    );
    expect(documents).toEqual([
      {
        id: 'https://example.org/org/kb',
        label: 'Koninklijke Bibliotheek',
        type: 'organization',
      },
    ]);
  });

  it('dedupes repeated labels for the same IRI and locale', () => {
    const documents = toLabelDocuments(
      quads(`
        <https://example.org/org/kb> foaf:name "KB"@nl .
        <https://example.org/org/kb> foaf:name "KB"@nl .
      `),
      'organization',
    );
    expect(documents).toHaveLength(1);
    expect(documents[0].label).toBe('KB');
  });
});

describe('buildLabelCollectionSchema', () => {
  it('keys documents by id and indexes the per-locale labels for display', () => {
    const schema = buildLabelCollectionSchema('labels_test');
    expect(schema.name).toBe('labels_test');
    const fieldNames = schema.fields?.map((field) => field.name) ?? [];
    expect(fieldNames).toEqual(
      expect.arrayContaining(['label', 'label_nl', 'label_en', 'type']),
    );
    // The IRI is the Typesense document id; it is not a separate field.
    expect(fieldNames).not.toContain('id');
  });
});
