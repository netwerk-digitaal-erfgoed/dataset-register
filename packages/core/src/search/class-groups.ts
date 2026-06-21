/**
 * Canonical mapping of RDF class IRIs to the coarse facet groups the dataset
 * browser shows alongside the granular classes. The search indexer derives the
 * `class_group` facet from a dataset’s DKG classes at index time using this
 * table, so the grouping is computed once and stored rather than recomputed in
 * SPARQL at query time. Both http and https schema.org variants are listed
 * because the Dataset Knowledge Graph carries class types from external datasets
 * that use either form.
 */
export const CLASS_GROUPS = {
  'group:person': [
    'http://schema.org/Person',
    'https://schema.org/Person',
    'http://www.cidoc-crm.org/cidoc-crm/E21_Person',
    'http://www.cidoc-crm.org/cidoc-crm/E39_Actor',
  ],
  'group:organization': [
    'http://schema.org/Organization',
    'https://schema.org/Organization',
    'http://www.cidoc-crm.org/cidoc-crm/E39_Actor',
  ],
  'group:media': [
    'http://schema.org/MediaObject',
    'https://schema.org/MediaObject',
    'http://schema.org/AudioObject',
    'https://schema.org/AudioObject',
    'http://schema.org/ImageObject',
    'https://schema.org/ImageObject',
    'http://www.cidoc-crm.org/cidoc-crm/E36_Visual_Item',
  ],
  'group:concept': ['http://www.w3.org/2004/02/skos/core#Concept'],
  'group:creative-work': [
    'http://schema.org/CreativeWork',
    'https://schema.org/CreativeWork',
    'http://schema.org/Article',
    'https://schema.org/Article',
    'http://schema.org/Book',
    'https://schema.org/Book',
    'http://schema.org/MusicComposition',
    'https://schema.org/MusicComposition',
    'http://www.cidoc-crm.org/cidoc-crm/E65_Creation',
    'http://www.cidoc-crm.org/cidoc-crm/E22_Human-Made_Object',
    'http://www.cidoc-crm.org/cidoc-crm/E12_Production',
  ],
  'group:place': [
    'http://schema.org/Place',
    'https://schema.org/Place',
    'http://schema.org/Country',
    'https://schema.org/Country',
    'http://schema.org/Periodical',
    'https://schema.org/Periodical',
    'http://schema.org/PostalAddress',
    'https://schema.org/PostalAddress',
    'http://www.cidoc-crm.org/cidoc-crm/E53_Place',
    'http://www.europeana.eu/schemas/edm/Place',
  ],
  'group:date': [
    'https://www.ica.org/standards/RiC/ontology#DateRange',
    'https://www.ica.org/standards/RiC/ontology#SingleDate',
    'http://www.cidoc-crm.org/cidoc-crm/E52_Time-Span',
    'http://www.europeana.eu/schemas/edm/TimeSpan',
  ],
  'group:provenance': [
    'http://www.w3.org/ns/prov#Activity',
    'http://www.w3.org/ns/prov#Agent',
    'http://www.w3.org/ns/prov#Entity',
  ],
  'group:event': [
    'http://www.cidoc-crm.org/cidoc-crm/E65_Creation',
    'http://www.cidoc-crm.org/cidoc-crm/E8_Acquisition',
    'http://schema.org/Event',
    'https://schema.org/Event',
    'http://schema.org/PublicationEvent',
    'https://schema.org/PublicationEvent',
  ],
} as const satisfies Record<string, readonly string[]>;

export type ClassGroup = keyof typeof CLASS_GROUPS;

/**
 * The groups whose member classes intersect the given dataset classes, in the
 * table’s declaration order. A class belonging to several groups (for example a
 * CIDOC actor) contributes to each.
 */
export function deriveClassGroups(classes: Iterable<string>): ClassGroup[] {
  const present = new Set(classes);
  return (Object.keys(CLASS_GROUPS) as ClassGroup[]).filter((group) =>
    CLASS_GROUPS[group].some((classIri) => present.has(classIri)),
  );
}
