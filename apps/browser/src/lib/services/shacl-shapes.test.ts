import { describe, expect, it } from 'vitest';
import { indexShapes, selectShape, type ShapesIndex } from './shacl-shapes.js';

const SH = 'http://www.w3.org/ns/shacl#';
const SCHEMA = 'https://schema.org/';
const LANG_STRING = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString';

describe('selectShape', () => {
  it('returns the metadata for a blank-node sourceShape', () => {
    // The API emits stable blank-node IDs across `/shacl` and validation
    // results, so a sibling shape (one of several constraints on the same
    // path) must resolve to its parent's shared description.
    const contactPointMeta = {
      description: 'Naam van het contactpunt, bij voorkeur een afdeling.',
      targetClass: undefined,
    };
    const index: ShapesIndex = {
      byPath: new Map([[`${SCHEMA}name`, [contactPointMeta]]]),
      byId: new Map([['_:df_13_226', contactPointMeta]]),
    };
    expect(
      selectShape(index, `${SCHEMA}name`, undefined, '_:df_13_226'),
    ).toEqual(contactPointMeta);
  });

  it('prefers the candidate matching the focus node class on shared paths', () => {
    const dataCatalogMeta = {
      description: 'Naam van de datacatalogus',
      targetClass: `${SCHEMA}DataCatalog`,
    };
    const datasetMeta = {
      description: 'De naam van de dataset.',
      targetClass: `${SCHEMA}Dataset`,
    };
    const index: ShapesIndex = {
      byPath: new Map([[`${SCHEMA}name`, [dataCatalogMeta, datasetMeta]]]),
      byId: new Map(),
    };
    expect(selectShape(index, `${SCHEMA}name`, `${SCHEMA}Dataset`)).toEqual(
      datasetMeta,
    );
  });

  it('returns undefined when no class-bound candidate matches the focus node', () => {
    // Previously the resolver fell back to the first candidate carrying a
    // description, surfacing a DataCatalog description on unrelated focus
    // nodes.
    const dataCatalogMeta = {
      description: 'Naam van de datacatalogus',
      targetClass: `${SCHEMA}DataCatalog`,
    };
    const index: ShapesIndex = {
      byPath: new Map([[`${SCHEMA}name`, [dataCatalogMeta]]]),
      byId: new Map(),
    };
    expect(
      selectShape(index, `${SCHEMA}name`, `${SCHEMA}ContactPoint`),
    ).toBeUndefined();
  });
});

describe('indexShapes', () => {
  it('shares the main shape description across sibling property shapes', () => {
    // Mirrors `nde-dataset:ContactPointShape` in requirements/shacl.ttl: a
    // NodeShape with two property shapes on `schema:name`. Only the main
    // (minCount) shape carries `sh:description`; per requirements/AGENTS.md
    // siblings should surface the same description.
    const json = [
      {
        '@id': 'https://example.org/ContactPointShape',
        '@type': [`${SH}NodeShape`],
        [`${SH}targetObjectsOf`]: [{ '@id': `${SCHEMA}contactPoint` }],
        [`${SH}property`]: [{ '@id': '_:main' }, { '@id': '_:sibling' }],
      },
      {
        '@id': '_:main',
        [`${SH}path`]: [{ '@id': `${SCHEMA}name` }],
        [`${SH}minCount`]: [{ '@value': '1' }],
        [`${SH}description`]: [
          { '@value': 'Naam van het contactpunt.', '@language': 'nl' },
        ],
      },
      {
        '@id': '_:sibling',
        [`${SH}path`]: [{ '@id': `${SCHEMA}name` }],
        [`${SH}datatype`]: [{ '@id': LANG_STRING }],
      },
    ];
    const index = indexShapes(json, 'nl');
    expect(index.byId.get('_:main')?.description).toBe(
      'Naam van het contactpunt.',
    );
    expect(index.byId.get('_:sibling')?.description).toBe(
      'Naam van het contactpunt.',
    );
  });

  it('binds metadata to the NodeShape’s class via sh:class as well as sh:targetClass', () => {
    // `DatacatalogShape` declares its class through `sh:class schema:DataCatalog`
    // (not `sh:targetClass`); the indexer must read both.
    const json = [
      {
        '@id': 'https://example.org/DatacatalogShape',
        '@type': [`${SH}NodeShape`],
        [`${SH}class`]: [{ '@id': `${SCHEMA}DataCatalog` }],
        [`${SH}property`]: [{ '@id': '_:catalog-name' }],
      },
      {
        '@id': '_:catalog-name',
        [`${SH}path`]: [{ '@id': `${SCHEMA}name` }],
        [`${SH}description`]: [
          { '@value': 'Naam van de datacatalogus', '@language': 'nl' },
        ],
      },
    ];
    const index = indexShapes(json, 'nl');
    const candidate = index.byPath.get(`${SCHEMA}name`)?.[0];
    expect(candidate?.targetClass).toBe(`${SCHEMA}DataCatalog`);
  });
});
