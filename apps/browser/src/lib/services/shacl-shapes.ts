import { PUBLIC_API_ENDPOINT } from '$app/env/public';
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
 * A property shape reused across NodeShapes (`SchemaLicenseIriProperty` is owned
 * by both the dataset and the distribution) has no `byId` entry, because its
 * description depends on which NodeShape the result came from. The path lookup
 * then picks the candidate bound to the focus node's class, or else the one
 * candidate bound to no class, such as a distribution's.
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
    const classBound = candidates.find((c) => c.targetClass === focusNodeType);
    if (classBound) return classBound;
    const unbound = candidates.filter((c) => !c.targetClass);
    return unbound.length === 1 ? unbound[0] : undefined;
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
  // Property shapes owned by more than one NodeShape, whose description
  // depends on the owner and so cannot be looked up by ID alone.
  const sharedShapeIds = new Set<string>();

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

    // One candidate per path for this NodeShape, shared by all its siblings.
    const metadataByPath = new Map<string, ShapeMetadata>();
    for (const sibling of siblings) {
      const description = descriptionByPath.get(sibling.pathIri);
      if (!description) continue;
      let metadata = metadataByPath.get(sibling.pathIri);
      if (!metadata) {
        metadata = { description, targetClass };
        metadataByPath.set(sibling.pathIri, metadata);
        const list = byPath.get(sibling.pathIri);
        if (list) list.push(metadata);
        else byPath.set(sibling.pathIri, [metadata]);
      }
      if (shapeById.has(sibling.refId)) sharedShapeIds.add(sibling.refId);
      shapeById.set(sibling.refId, metadata);
    }
  }

  for (const id of sharedShapeIds) shapeById.delete(id);

  return { byPath, byId: shapeById };
}
