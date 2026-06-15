import { describe, expect, it } from 'vitest';
import { Parser } from 'n3';
import { frameDatasets } from '../src/frame.ts';

const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const DCAT = 'http://www.w3.org/ns/dcat#';
const DCT = 'http://purl.org/dc/terms/';
const FOAF = 'http://xmlns.com/foaf/0.1/';

function quads(ntriples: string) {
  return new Parser({ format: 'N-Triples' }).parse(ntriples);
}

async function collect(
  iterable: AsyncIterable<Record<string, unknown>>,
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for await (const item of iterable) {
    out.push(item);
  }
  return out;
}

describe('frameDatasets', () => {
  it('frames each dataset’s one-hop subgraph into an IR node, merging DKG', async () => {
    const nodes = await collect(
      frameDatasets(
        quads(`
          <https://ex/d/1> <${RDF}type> <${DCAT}Dataset> .
          <https://ex/d/1> <${DCT}title> "Titel"@nl .
          <https://ex/d/1> <${DCT}publisher> <https://ex/o/1> .
          <https://ex/o/1> <${FOAF}name> "Org"@nl .
          <https://ex/d/1> <urn:dr:class> <http://schema.org/Person> .
          <https://ex/d/2> <${RDF}type> <${DCAT}Dataset> .
          <https://ex/d/2> <${DCT}title> "Andere"@nl .
        `),
      ),
    );

    expect(nodes).toHaveLength(2);
    const byId = Object.fromEntries(nodes.map((node) => [node['@id'], node]));

    const one = byId['https://ex/d/1'] as Record<string, unknown>;
    // DKG triple merged onto the dataset node.
    expect(one['urn:dr:class']).toEqual({ '@id': 'http://schema.org/Person' });
    // The one-hop publisher node is embedded with its name.
    expect(one[`${DCT}publisher`]).toMatchObject({
      '@id': 'https://ex/o/1',
      [`${FOAF}name`]: { '@language': 'nl', '@value': 'Org' },
    });
    expect((byId['https://ex/d/2'] as Record<string, unknown>)[`${DCT}title`]).toEqual({
      '@language': 'nl',
      '@value': 'Andere',
    });
  });

  it('dedupes triples QLever emits more than once', async () => {
    const nodes = await collect(
      frameDatasets(
        quads(`
          <https://ex/d/1> <${RDF}type> <${DCAT}Dataset> .
          <https://ex/d/1> <${RDF}type> <${DCAT}Dataset> .
          <https://ex/d/1> <${DCT}title> "Titel"@nl .
          <https://ex/d/1> <${DCT}title> "Titel"@nl .
        `),
      ),
    );

    expect(nodes).toHaveLength(1);
    // The duplicated title collapses to a single value, not an array of two.
    expect(nodes[0]![`${DCT}title`]).toEqual({ '@language': 'nl', '@value': 'Titel' });
  });

  it('yields nothing when there are no dataset nodes', async () => {
    const nodes = await collect(
      frameDatasets(quads(`<https://ex/o/1> <${FOAF}name> "Org"@nl .`)),
    );
    expect(nodes).toEqual([]);
  });
});
