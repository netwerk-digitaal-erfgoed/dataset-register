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
 * Pick the property-shape metadata that describes a SHACL validation result.
 *
 * Prefers a direct hit by `sh:sourceShape` – the API emits stable blank-node
 * IDs across the `/shacl` and validation endpoints, so blank-node sourceShapes
 * match too. Falls back to a path lookup, narrowed by the focus node's
 * rdf:type when that is known: descriptions on shared paths like
 * `schema:name` belong to a specific class, and inheriting one from another
 * NodeShape would mislead the reader.
 *
 * A property shape reused across class shapes (`SchemaDescriptionPropertyShouldExist`
 * is owned by both the catalog and the dataset) has a single `byId` entry, won by
 * whichever NodeShape was indexed last. Taking that hit would attribute the last
 * owner's description to every subject – exactly what the path lookup exists to
 * prevent – so it is only trusted when it cannot belong to a different subject.
 */
export function selectShape(
  index: ShapesIndex,
  pathIri: string | undefined,
  focusNodeType?: string,
  sourceShapeIri?: string,
): ShapeMetadata | undefined {
  if (sourceShapeIri) {
    const direct = index.byId.get(sourceShapeIri);
    if (direct && !contradictsFocusNode(direct, focusNodeType)) return direct;
  }
  if (!pathIri) return undefined;
  const candidates = index.byPath.get(pathIri);
  if (!candidates?.length) return undefined;
  if (focusNodeType) {
    return candidates.find((c) => c.targetClass === focusNodeType);
  }
  if (candidates.length === 1) return candidates[0];
  return candidates.find((c) => c.description) ?? undefined;
}

/**
 * Whether this metadata describes a different subject than the focus node.
 *
 * A shape without a `targetClass` (such as a distribution's, which is targeted via
 * `sh:targetObjectsOf`) constrains no particular class and so contradicts nothing.
 */
function contradictsFocusNode(
  metadata: ShapeMetadata,
  focusNodeType: string | undefined,
): boolean {
  if (!focusNodeType || !metadata.targetClass) return false;
  return metadata.targetClass !== focusNodeType;
}

export function indexShapes(json: unknown, locale: string): ShapesIndex {
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

    const targetClass =
      pickIri(node[`${SH}targetClass`]) ?? pickIri(node[`${SH}class`]);
    const propertyRefs = node[`${SH}property`];
    if (!Array.isArray(propertyRefs)) continue;

    // Collect every property shape this NodeShape owns. Per requirements/AGENTS.md
    // the main shape for a property carries `sh:description`; sibling shapes
    // (different constraints on the same path) only carry `sh:message`. Group
    // siblings by path so each sibling can surface the main shape's description.
    type Sibling = { refId: string; pathIri: string; description?: string };
    const siblings: Sibling[] = [];
    for (const ref of propertyRefs) {
      const refId =
        ref && typeof ref === 'object' && '@id' in ref
          ? String((ref as { '@id': string })['@id'])
          : null;
      if (!refId) continue;
      const propertyShape = byId.get(refId);
      if (!propertyShape) continue;
      const pathIri = pickIri(propertyShape[`${SH}path`]);
      if (!pathIri) continue;
      const description = pickLocalized(
        propertyShape[`${SH}description`],
        locale,
      );
      siblings.push({ refId, pathIri, description });
    }

    const descriptionByPath = new Map<string, string>();
    for (const sibling of siblings) {
      if (sibling.description && !descriptionByPath.has(sibling.pathIri)) {
        descriptionByPath.set(sibling.pathIri, sibling.description);
      }
    }

    for (const sibling of siblings) {
      const description = descriptionByPath.get(sibling.pathIri);
      if (!description) continue;
      const metadata: ShapeMetadata = { description, targetClass };
      const list = byPath.get(sibling.pathIri);
      if (list) list.push(metadata);
      else byPath.set(sibling.pathIri, [metadata]);
      shapeById.set(sibling.refId, metadata);
    }
  }

  return { byPath, byId: shapeById };
}
