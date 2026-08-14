import type { Quad } from '@rdfjs/types';

export const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

/**
 * The distinct subjects a graph types as instances of `classIri`.
 *
 * `projectRoots` projects one type over the roots it is handed rather than
 * discovering them itself, so each rebuild names its own roots. Typing is how
 * both readers mark them: the register CONSTRUCT emits `rdf:type dcat:Dataset`,
 * and {@link prepareLabelQuads} injects the label-source type per subject.
 */
export function rootsOfClass(
  quads: readonly Quad[],
  classIri: string,
): readonly string[] {
  const roots = new Set<string>();
  for (const quad of quads) {
    if (quad.predicate.value === RDF_TYPE && quad.object.value === classIri) {
      roots.add(quad.subject.value);
    }
  }
  return [...roots];
}
