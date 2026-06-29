import factory from 'rdf-ext';
import { quadsToNTriples, serializeQuads } from '../src/rdf-serialize.js';

const quad = factory.quad(
  factory.namedNode('https://example.com/s'),
  factory.namedNode('https://example.com/p'),
  factory.literal('o'),
);

describe('serializeQuads', () => {
  it('serializes quads to JSON-LD', async () => {
    const nodes = JSON.parse(
      await serializeQuads(factory.dataset([quad]), 'application/ld+json'),
    ) as Array<Record<string, unknown>>;
    expect(Array.isArray(nodes)).toBe(true);
    expect(nodes[0]['@id']).toBe('https://example.com/s');
  });

  it('serializes quads to other content types, such as N-Triples', async () => {
    const result = await serializeQuads(
      factory.dataset([quad]),
      'application/n-triples',
    );
    expect(result).toContain(
      '<https://example.com/s> <https://example.com/p> "o" .',
    );
  });
});

describe('quadsToNTriples', () => {
  it('serializes quads to an N-Triples string', async () => {
    const result = await quadsToNTriples([quad]);
    expect(result).toContain(
      '<https://example.com/s> <https://example.com/p> "o" .',
    );
  });
});
