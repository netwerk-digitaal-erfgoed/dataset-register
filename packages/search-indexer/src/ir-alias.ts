import type { RootType, SearchSchema } from '@lde/search';
import { fieldNamed, irAlias } from '@lde/search/adapter';

/**
 * A declared root type by its class IRI. The schema is built over these types,
 * so a miss is a programmer error (a renamed or removed type), not a runtime
 * condition – it throws where the type is looked up rather than surfacing later
 * as an empty collection.
 */
export function rootTypeOf(schema: SearchSchema, classIri: string): RootType {
  const searchType = schema.get(classIri);
  if (searchType === undefined) {
    throw new Error(`The search schema does not declare the type ${classIri}.`);
  }
  return searchType;
}

/**
 * The **IR Alias** predicate a reader emits one field's values under, ready to
 * drop into a SPARQL template (angle-bracketed).
 *
 * `@lde/search` projects a field from `urn:lde:‹Type›/‹field›`, not from the
 * source predicate: a field's `path` states what the reader reads (a property
 * path, which cannot be a CONSTRUCT template verb), and the alias is what it
 * emits the flattened value under. Both sides call {@link irAlias} rather than
 * writing the convention out, so a renamed field cannot silently stop being
 * projected.
 *
 * The generated extraction CONSTRUCT (`@lde/search-pipeline`) does exactly this
 * for a query derivable from `path` alone. Our readers stay hand-written
 * because they encode deployment facts no schema states – the per-dataset GRAPH
 * scoping, the newest-registration selection, the `STR()` casts that keep an
 * IRI-valued `dct:language` a literal, and the DKG's per-metric `dqv`
 * measurement branches – but they mint their predicates from the same function.
 *
 * Throws on an unknown field name: the schema is built over these types, so a
 * miss is a programmer error (a renamed or removed field), caught when the
 * query is built rather than as a silently empty facet.
 */
export function irAliasOf(searchType: RootType, fieldName: string): string {
  const field = fieldNamed(searchType, fieldName);
  if (field === undefined) {
    throw new Error(
      `${searchType.name} declares no field named ${fieldName}, so no IR Alias can be minted for it.`,
    );
  }
  return `<${irAlias(searchType, field)}>`;
}
