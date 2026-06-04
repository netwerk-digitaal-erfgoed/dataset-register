import { describe, expect, it } from 'vitest';
import {
  conformsToSchemaApNde,
  iiifManifestCount,
  providesWorkingIiif,
  type DatasetCard,
} from './datasets';
import { IIIF_PRESENTATION_API } from './nde-compatibility';

// The helpers only read the IIIF fields, so a minimal cast keeps the fixtures
// focused on the behaviour under test.
function card(fields: Record<string, unknown>): DatasetCard {
  return fields as unknown as DatasetCard;
}

function iiifSubset(entities: number) {
  return { $id: '_:iiif', conformsTo: IIIF_PRESENTATION_API, entities };
}

describe('iiifManifestCount', () => {
  it('returns the declared entity count of the IIIF subset', () => {
    expect(iiifManifestCount(card({ iiifSubset: iiifSubset(42) }))).toBe(42);
  });

  it('returns 0 when there is no IIIF subset', () => {
    expect(iiifManifestCount(card({ iiifSubset: null }))).toBe(0);
  });

  it('ignores a subset with a different conformsTo discriminator', () => {
    expect(
      iiifManifestCount(
        card({
          iiifSubset: {
            $id: '_:other',
            conformsTo: 'http://example.org/other',
            entities: 7,
          },
        }),
      ),
    ).toBe(0);
  });
});

describe('providesWorkingIiif', () => {
  it('is true when sampled manifests validated', () => {
    expect(
      providesWorkingIiif(
        card({
          iiifSubset: iiifSubset(100),
          iiifManifestsSampled: 10,
          iiifManifestsValidated: 8,
        }),
      ),
    ).toBe(true);
  });

  it('is false when manifests are declared but none validated', () => {
    expect(
      providesWorkingIiif(
        card({
          iiifSubset: iiifSubset(4152),
          iiifManifestsSampled: 10,
          iiifManifestsValidated: 0,
        }),
      ),
    ).toBe(false);
  });

  it('is true when declared but not yet validated (no evidence of failure)', () => {
    expect(providesWorkingIiif(card({ iiifSubset: iiifSubset(5) }))).toBe(true);
  });

  it('is false when no IIIF subset is declared', () => {
    expect(providesWorkingIiif(card({ iiifSubset: null }))).toBe(false);
  });
});

describe('conformsToSchemaApNde', () => {
  it('is true when the validated sample conforms', () => {
    expect(
      conformsToSchemaApNde(
        card({ schemaApNdeQuadsValidated: 200, schemaApNdeConformant: true }),
      ),
    ).toBe(true);
  });

  it('is false when the validated sample does not conform', () => {
    expect(
      conformsToSchemaApNde(
        card({ schemaApNdeQuadsValidated: 200, schemaApNdeConformant: false }),
      ),
    ).toBe(false);
  });

  it('is false when zero quads were validated (profile does not apply)', () => {
    expect(
      conformsToSchemaApNde(
        card({ schemaApNdeQuadsValidated: 0, schemaApNdeConformant: false }),
      ),
    ).toBe(false);
  });

  it('is false when no conformance measurement exists', () => {
    expect(conformsToSchemaApNde(card({}))).toBe(false);
  });
});
