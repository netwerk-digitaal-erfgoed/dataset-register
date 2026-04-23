import { PUBLIC_API_ENDPOINT } from '$env/static/public';
import { getLocale } from '$lib/paraglide/runtime';
import { normalizeNodes, pickIri, pickLocalized } from './jsonld-helpers.js';

const SH = 'http://www.w3.org/ns/shacl#';

export interface ShapeMetadata {
  description?: string;
  targetClass?: string;
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
 * matching shape. Prefers a direct hit by `sh:sourceShape` IRI, then
 * `sh:targetClass` match; when multiple shapes share a path we pick the
 * first one carrying a `sh:description`, since that description applies to
 * the property as a whole regardless of which specific constraint failed.
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
  if (!candidates?.length) return undefined;
  if (focusNodeType) {
    const matching = candidates.find((c) => c.targetClass === focusNodeType);
    if (matching) return matching;
  }
  if (candidates.length === 1) return candidates[0];
  // Multiple property shapes share this path (different constraints on the
  // same property). The generic property description is shared across them,
  // so pick the first candidate that actually carries one.
  return candidates.find((c) => c.description) ?? undefined;
}

function indexShapes(json: unknown, locale: string): ShapesIndex {
  const nodes = normalizeNodes<Record<string, unknown>>(json);
  const byId = new Map<string, Record<string, unknown>>();
  for (const node of nodes) {
    const id = node['@id'];
    if (typeof id === 'string') byId.set(id, node);
  }

  const byPath = new Map<string, ShapeMetadata[]>();
  const shapeById = new Map<string, ShapeMetadata>();

  for (const node of nodes) {
    const types = node['@type'];
    if (!Array.isArray(types) || !types.includes(`${SH}NodeShape`)) continue;

    const targetClass = pickIri(node[`${SH}targetClass`]);
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

      const description = pickLocalized(
        propertyShape[`${SH}description`],
        locale,
      );
      if (!description) continue;

      const metadata: ShapeMetadata = {
        description,
        targetClass,
      };

      const pathIri = pickIri(propertyShape[`${SH}path`]);
      if (pathIri) {
        const list = byPath.get(pathIri);
        if (list) list.push(metadata);
        else byPath.set(pathIri, [metadata]);
      }
      if (!refId.startsWith('_:')) shapeById.set(refId, metadata);
    }
  }

  return { byPath, byId: shapeById };
}
