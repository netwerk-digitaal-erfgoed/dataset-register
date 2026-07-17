import { describe, expect, it } from 'vitest';
import { buildFocusNodeTypes } from './focus-node-types.js';

describe('buildFocusNodeTypes', () => {
  it('standardizes the http schema.org prefix that sources publish', async () => {
    // A source may publish either prefix, while the shapes and the report only use
    // https. Without standardizing here, a focus node's type never matches a shape's
    // sh:class and the reader gets no description at all.
    const source = JSON.stringify({
      '@graph': [
        { '@id': '_:autos1', '@type': 'http://schema.org/DataCatalog' },
        { '@id': '_:autos2', '@type': 'http://schema.org/DataDownload' },
      ],
    });
    const types = await buildFocusNodeTypes(source, 'application/ld+json');
    expect(types.get('_:autos1')).toBe('https://schema.org/DataCatalog');
    expect(types.get('_:autos2')).toBe('https://schema.org/DataDownload');
  });

  it('leaves an https schema.org type and other vocabularies untouched', async () => {
    const source = JSON.stringify({
      '@graph': [
        { '@id': '_:a', '@type': 'https://schema.org/Dataset' },
        { '@id': '_:b', '@type': 'http://www.w3.org/ns/dcat#Catalog' },
      ],
    });
    const types = await buildFocusNodeTypes(source, 'application/ld+json');
    expect(types.get('_:a')).toBe('https://schema.org/Dataset');
    expect(types.get('_:b')).toBe('http://www.w3.org/ns/dcat#Catalog');
  });

  it('standardizes types parsed from Turtle too', async () => {
    const source = `
      @prefix schema: <http://schema.org/> .
      <https://example.org/c> a schema:DataCatalog .
    `;
    const types = await buildFocusNodeTypes(source, 'text/turtle');
    expect(types.get('https://example.org/c')).toBe(
      'https://schema.org/DataCatalog',
    );
  });
});
