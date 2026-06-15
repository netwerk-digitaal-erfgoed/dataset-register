import type { LangValue, RawDataset } from './projection.js';

/**
 * Maps one framed JSON-LD dataset node (the engine-agnostic IR produced by
 * `jsonld.frame()` over the register + DKG CONSTRUCT graphs) into the flat
 * {@link RawDataset} the projector consumes. Keys are full predicate IRIs (the
 * frame carries no `@context`); framing emits a bare object for single-valued
 * predicates and an array for multi-valued ones, so every accessor normalizes to
 * an array first. Literals are `{@value,@language|@type}` or bare strings; IRI
 * references are `{@id}`.
 */
const DCT = 'http://purl.org/dc/terms/';
const DCAT = 'http://www.w3.org/ns/dcat#';
const SCHEMA = 'https://schema.org/';
/** Register-internal IR predicates: promoted registration facts + DKG facets. */
const DR = 'urn:dr:';

type JsonLdNode = Record<string, unknown>;

export function framedDatasetToRaw(node: JsonLdNode): RawDataset {
  const classes = iris(node, `${DR}class`);
  const terminologySources = iris(node, `${DR}terminologySource`);
  const size = firstLiteral(node, `${DR}size`);
  return {
    iri: typeof node['@id'] === 'string' ? node['@id'] : '',
    titles: langValues(node, `${DCT}title`),
    descriptions: langValues(node, `${DCT}description`),
    keywords: langValues(node, `${DCAT}keyword`),
    languages: plainLiterals(node, `${DCT}language`),
    publisherIris: iris(node, `${DCT}publisher`),
    // Names and distribution facets are promoted flat onto the dataset by the
    // register CONSTRUCT (see RegisterSource.readQuads), not nested.
    publisherNames: langValues(node, `${DR}publisherName`),
    creatorNames: langValues(node, `${DR}creatorName`),
    mediaTypes: plainLiterals(node, `${DR}format`),
    conformsTo: plainLiterals(node, `${DR}conformsTo`),
    additionalTypes: iris(node, `${SCHEMA}additionalType`),
    dateReadIso: firstLiteral(node, `${DR}dateRead`),
    datePostedIso: firstLiteral(node, `${DR}datePosted`),
    validUntilIso: firstLiteral(node, `${DR}validUntil`),
    // DKG facets stay absent (not empty) when the join produced nothing, so the
    // projector can tell “no DKG” from “DKG with no value”.
    ...(classes.length > 0 ? { classes } : {}),
    ...(terminologySources.length > 0 ? { terminologySources } : {}),
    ...(size !== undefined ? { size: Math.trunc(Number(size)) } : {}),
  };
}

/** Normalize a framed predicate value to an array (single object or array). */
function values(node: JsonLdNode, predicate: string): unknown[] {
  const value = node[predicate];
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function langValues(node: JsonLdNode, predicate: string): LangValue[] {
  return values(node, predicate)
    .map(toLangValue)
    .filter((value): value is LangValue => value !== undefined);
}

function plainLiterals(node: JsonLdNode, predicate: string): string[] {
  return values(node, predicate)
    .map(literalString)
    .filter((value): value is string => value !== undefined);
}

function firstLiteral(node: JsonLdNode, predicate: string): string | undefined {
  return plainLiterals(node, predicate)[0];
}

function iris(node: JsonLdNode, predicate: string): string[] {
  return values(node, predicate)
    .map(iriString)
    .filter((value): value is string => value !== undefined);
}

function toLangValue(value: unknown): LangValue | undefined {
  const literal = literalString(value);
  if (literal === undefined) {
    return undefined;
  }
  const lang =
    isObject(value) && typeof value['@language'] === 'string'
      ? value['@language']
      : '';
  return { value: literal, lang };
}

function literalString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (isObject(value)) {
    const inner = value['@value'];
    if (typeof inner === 'string') {
      return inner;
    }
    if (typeof inner === 'number' || typeof inner === 'boolean') {
      return String(inner);
    }
  }
  return undefined;
}

function iriString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (isObject(value) && typeof value['@id'] === 'string') {
    return value['@id'];
  }
  return undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
