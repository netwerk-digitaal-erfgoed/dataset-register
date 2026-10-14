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
      byId: new Map([['_:df_13_226', [contactPointMeta]]]),
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

  it('falls back to the one path candidate bound to no class', () => {
    // An organisation’s missing contact point is reported by a SPARQL-based
    // NodeShape, whose sourceShape has no description. The description lives on
    // the agent shape, which is targeted via sh:targetObjectsOf and has no class.
    const datasetMeta = {
      description: 'Contactinformatie voor vragen over de dataset.',
      targetClass: `${SCHEMA}Dataset`,
    };
    const agentMeta = {
      description: 'Contactinformatie voor vragen over de organisatie.',
      targetClass: undefined,
    };
    const index: ShapesIndex = {
      byPath: new Map([[`${SCHEMA}contactPoint`, [datasetMeta, agentMeta]]]),
      byId: new Map(),
    };
    expect(
      selectShape(
        index,
        `${SCHEMA}contactPoint`,
        `${SCHEMA}Organization`,
        'https://def.nde.nl/dataset#OrganizationContactPointRequiredShape',
      ),
    ).toEqual(agentMeta);
  });

  it('gives no path description when several candidates are bound to no class', () => {
    const agentMeta = {
      description: 'De naam van de organisatie.',
      targetClass: undefined,
    };
    const distributionMeta = {
      description: 'De naam van de distributie.',
      targetClass: undefined,
    };
    const index: ShapesIndex = {
      byPath: new Map([[`${SCHEMA}name`, [agentMeta, distributionMeta]]]),
      byId: new Map(),
    };
    expect(
      selectShape(index, `${SCHEMA}name`, `${SCHEMA}Organization`),
    ).toBeUndefined();
  });

  it('ignores a sourceShape hit describing a different class than the focus node', () => {
    // Taking it would tell someone describing a catalog to describe the dataset
    // instead.
    const dataCatalogMeta = {
      description: 'Een beschrijving van de inhoud van de datacatalogus.',
      targetClass: `${SCHEMA}DataCatalog`,
    };
    const datasetMeta = {
      description: 'Een beschrijving van de inhoud van de dataset.',
      targetClass: `${SCHEMA}Dataset`,
    };
    const sharedShape = 'https://def.nde.nl/dataset#SchemaDescriptionProperty';
    const index: ShapesIndex = {
      byPath: new Map([
        [`${SCHEMA}description`, [dataCatalogMeta, datasetMeta]],
      ]),
      byId: new Map([[sharedShape, [datasetMeta]]]),
    };
    expect(
      selectShape(
        index,
        `${SCHEMA}description`,
        `${SCHEMA}DataCatalog`,
        sharedShape,
      ),
    ).toEqual(dataCatalogMeta);
  });

  it('keeps a sourceShape hit that is bound to no class', () => {
    // A distribution shape is targeted via sh:targetObjectsOf and carries no
    // sh:class, so it constrains no particular class and contradicts nothing.
    const distributionMeta = {
      description: 'Beschrijving van de distributie',
      targetClass: undefined,
    };
    const index: ShapesIndex = {
      byPath: new Map([[`${SCHEMA}description`, [distributionMeta]]]),
      byId: new Map([['_:df_15_191', [distributionMeta]]]),
    };
    expect(
      selectShape(
        index,
        `${SCHEMA}description`,
        `${SCHEMA}DataDownload`,
        '_:df_15_191',
      ),
    ).toEqual(distributionMeta);
  });

  it('picks the owner of a shared sourceShape that fits the focus node', () => {
    // `SchemaLicenseIriProperty` is owned by both the dataset and the distribution
    // shape. A dataset’s result must not be explained with the distribution’s
    // description, nor the other way round.
    const datasetMeta = {
      description: 'De licentie van de dataset.',
      targetClass: `${SCHEMA}Dataset`,
    };
    const distributionMeta = {
      description: 'De licentie van de distributie.',
      targetClass: undefined,
    };
    const sharedShape = 'https://def.nde.nl/dataset#SchemaLicenseIriProperty';
    const index: ShapesIndex = {
      byPath: new Map([[`${SCHEMA}license`, [datasetMeta, distributionMeta]]]),
      byId: new Map([[sharedShape, [datasetMeta, distributionMeta]]]),
    };
    expect(
      selectShape(index, `${SCHEMA}license`, `${SCHEMA}Dataset`, sharedShape),
    ).toEqual(datasetMeta);
    expect(
      selectShape(
        index,
        `${SCHEMA}license`,
        `${SCHEMA}DataDownload`,
        sharedShape,
      ),
    ).toEqual(distributionMeta);
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
    expect(index.byId.get('_:main')?.[0]?.description).toBe(
      'Naam van het contactpunt.',
    );
    expect(index.byId.get('_:sibling')?.[0]?.description).toBe(
      'Naam van het contactpunt.',
    );
  });

  it('keeps every owner of a property shape shared across NodeShapes', () => {
    // Mirrors `SchemaLicenseIriProperty`: a named sibling shape referenced by both
    // the dataset and the distribution shape, each with its own main shape.
    const json = [
      {
        '@id': 'https://example.org/DatasetShape',
        '@type': [`${SH}NodeShape`],
        [`${SH}targetClass`]: [{ '@id': `${SCHEMA}Dataset` }],
        [`${SH}property`]: [
          { '@id': '_:dataset-license' },
          { '@id': 'https://example.org/LicenseIri' },
        ],
      },
      {
        '@id': 'https://example.org/DistributionShape',
        '@type': [`${SH}NodeShape`],
        [`${SH}targetObjectsOf`]: [{ '@id': `${SCHEMA}distribution` }],
        [`${SH}property`]: [
          { '@id': '_:distribution-license' },
          { '@id': 'https://example.org/LicenseIri' },
        ],
      },
      {
        '@id': '_:dataset-license',
        [`${SH}path`]: [{ '@id': `${SCHEMA}license` }],
        [`${SH}description`]: [
          { '@value': 'De licentie van de dataset.', '@language': 'nl' },
        ],
      },
      {
        '@id': '_:distribution-license',
        [`${SH}path`]: [{ '@id': `${SCHEMA}license` }],
        [`${SH}description`]: [
          { '@value': 'De licentie van de distributie.', '@language': 'nl' },
        ],
      },
      {
        '@id': 'https://example.org/LicenseIri',
        [`${SH}path`]: [{ '@id': `${SCHEMA}license` }],
        [`${SH}nodeKind`]: [{ '@id': `${SH}IRI` }],
      },
    ];
    const index = indexShapes(json, 'nl');
    expect(index.byId.get('https://example.org/LicenseIri')).toEqual([
      {
        description: 'De licentie van de dataset.',
        targetClass: `${SCHEMA}Dataset`,
      },
      {
        description: 'De licentie van de distributie.',
        targetClass: undefined,
      },
    ]);
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
