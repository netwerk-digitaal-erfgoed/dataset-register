import { PUBLIC_API_ENDPOINT } from '$env/static/public';
import { getLocale } from '$lib/paraglide/runtime';

const SH = 'http://www.w3.org/ns/shacl#';

export interface ShapeMetadata {
  name: string;
  description?: string;
  targetClass?: string;
  targetSubjectsOf?: string;
}

export interface ShapesIndex {
  byPath: Map<string, ShapeMetadata[]>;
  byId: Map<string, ShapeMetadata>;
}

let cachedPromise: Promise<ShapesIndex> | null = null;
let cachedLocale: string | null = null;

export function fetchShapes(signal?: AbortSignal): Promise<ShapesIndex> {
  const locale = getLocale();
  if (cachedPromise && cachedLocale === locale) return cachedPromise;
  cachedLocale = locale;
  cachedPromise = fetch(`${PUBLIC_API_ENDPOINT}/shacl`, {
    method: 'GET',
    headers: { Accept: 'application/ld+json' },
    signal,
  })
    .then((response) => {
      if (!response.ok) throw new Error(`/shacl returned ${response.status}`);
      return response.json();
    })
    .then((json) => indexShapes(json, locale))
    .catch((error) => {
      cachedPromise = null;
      throw error;
    });
  return cachedPromise;
}

/**
 * Given a path IRI and the focusNode's rdf:type (optional), pick the best
 * matching shape name. Prefers the shape whose `sh:targetClass` matches the
 * focus-node type; falls back to the first entry.
 */
export function selectShape(
  index: ShapesIndex,
  pathIri: string | undefined,
  focusNodeType?: string,
  sourceShapeIri?: string,
): ShapeMetadata | undefined {
  if (sourceShapeIri && !sourceShapeIri.startsWith('_:')) {
    const direct = index.byId.get(sourceShapeIri);
    if (direct) return direct;
  }
  if (!pathIri) return undefined;
  const candidates = index.byPath.get(pathIri);
  if (!candidates || candidates.length === 0) return undefined;
  if (focusNodeType) {
    const matching = candidates.find((c) => c.targetClass === focusNodeType);
    if (matching) return matching;
  }
  // When we can't disambiguate between shapes sharing a path (e.g. both
  // Dataset and DataCatalog define sh:name), avoid guessing — the caller
  // falls back to the CURIE-shortened path.
  if (candidates.length === 1) return candidates[0];
  return undefined;
}

function indexShapes(json: unknown, locale: string): ShapesIndex {
  const nodes = Array.isArray(json)
    ? (json as Record<string, unknown>[])
    : extractGraph(json);

  const byId = new Map<string, Record<string, unknown>>();
  for (const node of nodes) {
    const id = node['@id'];
    if (typeof id === 'string') byId.set(id, node);
  }

  const byPath = new Map<string, ShapeMetadata[]>();
  const shapeById = new Map<string, ShapeMetadata>();

  for (const node of nodes) {
    const types = node['@type'];
    const isNodeShape =
      Array.isArray(types) && types.includes(`${SH}NodeShape`);
    if (!isNodeShape) continue;

    const targetClass = pickIri(node[`${SH}targetClass`]);
    const targetSubjectsOf = pickIri(node[`${SH}targetSubjectsOf`]);

    const propertyRefs = node[`${SH}property`];
    if (!Array.isArray(propertyRefs)) continue;

    for (const ref of propertyRefs) {
      const refId =
        ref && typeof ref === 'object' && '@id' in ref
          ? String((ref as { '@id': string })['@id'])
          : null;
      if (!refId) continue;
      const propertyShape = byId.get(refId);
      if (!propertyShape) continue;

      const pathIri = pickIri(propertyShape[`${SH}path`]);
      const name = pickLocalized(propertyShape[`${SH}name`], locale);
      const description = pickLocalized(
        propertyShape[`${SH}description`],
        locale,
      );
      if (!name) continue;

      const metadata: ShapeMetadata = {
        name,
        description,
        targetClass: targetClass ?? undefined,
        targetSubjectsOf: targetSubjectsOf ?? undefined,
      };

      if (pathIri) {
        const list = byPath.get(pathIri);
        if (list) list.push(metadata);
        else byPath.set(pathIri, [metadata]);
      }
      if (!refId.startsWith('_:')) {
        shapeById.set(refId, metadata);
      }
    }
  }

  return { byPath, byId: shapeById };
}

function extractGraph(json: unknown): Record<string, unknown>[] {
  if (json && typeof json === 'object') {
    const graph = (json as Record<string, unknown>)['@graph'];
    if (Array.isArray(graph)) return graph as Record<string, unknown>[];
    return [json as Record<string, unknown>];
  }
  return [];
}

function pickIri(values: unknown): string | undefined {
  const first = pickFirst(values);
  if (first && typeof first === 'object' && '@id' in first) {
    return String((first as { '@id': unknown })['@id']);
  }
  return undefined;
}

function pickLocalized(values: unknown, locale: string): string | undefined {
  if (!values) return undefined;
  const array = Array.isArray(values) ? values : [values];
  const byLang = new Map<string, string>();
  let untagged: string | undefined;
  for (const entry of array) {
    if (!entry || typeof entry !== 'object' || !('@value' in entry)) continue;
    const value = String((entry as { '@value': unknown })['@value']);
    const lang = (entry as { '@language'?: string })['@language'];
    if (lang) byLang.set(lang, value);
    else if (untagged === undefined) untagged = value;
  }
  return byLang.get(locale) ?? byLang.get('en') ?? byLang.get('nl') ?? untagged;
}

function pickFirst(values: unknown): unknown {
  if (Array.isArray(values)) return values[0];
  return values;
}
