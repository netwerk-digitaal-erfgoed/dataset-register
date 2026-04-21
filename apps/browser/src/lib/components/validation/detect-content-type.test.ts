import { describe, expect, it } from 'vitest';
import {
  detectContentType,
  languageForContentType,
} from './detect-content-type.js';

describe('detectContentType', () => {
  it('returns null for empty input', () => {
    expect(detectContentType('')).toBeNull();
    expect(detectContentType('   \n  ')).toBeNull();
  });

  it('detects JSON-LD when input starts with { or [', () => {
    expect(detectContentType('{"@context": "https://schema.org/"}')).toBe(
      'application/ld+json',
    );
    expect(detectContentType('  [ { "@id": "x" } ]')).toBe(
      'application/ld+json',
    );
  });

  it('detects RDF/XML by xml declaration or rdf:RDF root', () => {
    expect(detectContentType('<?xml version="1.0"?>\n<rdf:RDF />')).toBe(
      'application/rdf+xml',
    );
    expect(detectContentType('<rdf:RDF xmlns:rdf="..."/>')).toBe(
      'application/rdf+xml',
    );
  });

  it('detects Turtle by @prefix/@base', () => {
    expect(
      detectContentType('@prefix schema: <https://schema.org/> .\n<a> schema:name "x" .'),
    ).toBe('text/turtle');
    expect(detectContentType('@base <https://ex/> .')).toBe('text/turtle');
  });

  it('detects Turtle by SPARQL-style PREFIX', () => {
    expect(detectContentType('PREFIX ex: <https://ex/>\n<a> <b> <c> .')).toBe(
      'text/turtle',
    );
  });

  it('detects N-Triples when first line starts with <iri>', () => {
    expect(
      detectContentType('<https://a> <https://b> "c" .\n<https://x> <https://y> "z" .'),
    ).toBe('application/n-triples');
  });

  it('detects N-Quads when there are four terms before the dot', () => {
    expect(
      detectContentType(
        '<https://a> <https://b> "c" <https://g> .\n<https://x> <https://y> "z" <https://g> .',
      ),
    ).toBe('application/n-quads');
  });

  it('falls back to Turtle for unknown shapes', () => {
    expect(detectContentType('something that is neither json nor xml')).toBe(
      'text/turtle',
    );
  });
});

describe('languageForContentType', () => {
  it('maps content types to editor languages', () => {
    expect(languageForContentType('application/ld+json')).toBe('json');
    expect(languageForContentType('application/rdf+xml')).toBe('xml');
    expect(languageForContentType('text/turtle')).toBe('turtle');
    expect(languageForContentType('application/n-triples')).toBe('turtle');
    expect(languageForContentType(null)).toBe('plain');
  });
});
