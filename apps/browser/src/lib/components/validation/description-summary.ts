import type { ContentType } from './detect-content-type.js';
import {
  expandTerm,
  parseN3Quads,
  safeParseJson,
  walkJsonLd,
} from './rdf-helpers.js';

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

const DATASET_TYPES = new Set([
  'http://www.w3.org/ns/dcat#Dataset',
  'https://schema.org/Dataset',
  'http://schema.org/Dataset',
]);

export interface DescriptionSummary {
  /** Number of distinct schema:Dataset / dcat:Dataset resources found. */
  datasetCount: number;
}

/**
 * Inspect the fetched source so the UI can say whether it retrieved a single
 * dataset description or several (a catalog). We only count dataset resources:
 * a dedicated dcat:Catalog / schema:DataCatalog node is an unreliable signal —
 * a single dataset commonly back-references the catalog it belongs to via
 * schema:includedInDataCatalog, and a catalog endpoint may return bare dataset
 * descriptions with no catalog node at all. Best effort — unknown formats or
 * parse errors return zero datasets.
 */
export async function summarizeDescription(
  sourceText: string,
  contentType: ContentType,
): Promise<DescriptionSummary> {
  if (!sourceText.trim()) return { datasetCount: 0 };

  if (contentType === 'application/ld+json') {
    const datasets = new Set<string>();
    let anonymousDatasets = 0;
    walkJsonLd(safeParseJson(sourceText), (node, context) => {
      const type = node['@type'];
      const types = Array.isArray(type) ? type : type ? [type] : [];
      for (const rawType of types) {
        if (typeof rawType !== 'string') continue;
        const iri = expandTerm(rawType, context) ?? rawType;
        if (DATASET_TYPES.has(iri)) {
          const id = node['@id'];
          if (typeof id === 'string') datasets.add(id);
          else anonymousDatasets += 1;
        }
      }
    });
    return { datasetCount: datasets.size + anonymousDatasets };
  }

  const datasets = new Set<string>();
  for (const quad of await parseN3Quads(sourceText, contentType)) {
    if (quad.predicate.value !== RDF_TYPE) continue;
    if (DATASET_TYPES.has(quad.object.value)) datasets.add(quad.subject.value);
  }
  return { datasetCount: datasets.size };
}
