import { fold } from '@lde/text-normalization';

/**
 * Cross-lingual, multi-way synonym groups seeded from #1684, so a Dutch query
 * finds English-described datasets and vice versa. Each inner array is one
 * equivalence group (Typesense multi-way synonyms): any term matches any other.
 *
 * Stored FOLDED – the same {@link fold} applied to documents and queries – so
 * synonym matching survives diacritics and case exactly as the index does.
 * Synonyms are query-time: changing this list needs no reindex, only a re-sync
 * of the Typesense synonyms on the next indexer run.
 */
const RAW_SYNONYM_GROUPS: readonly (readonly string[])[] = [
  ['object', 'voorwerp', 'item', 'record'],
  ['persoon', 'person', 'people', 'mensen'],
  ['plaats', 'place', 'location', 'plek'],
  ['beeldmateriaal', 'image', 'images', 'afbeelding', 'media'],
  ['archief', 'archive', 'archives'],
  ['kaart', 'map', 'maps'],
  ['boek', 'book', 'books'],
  ['krant', 'newspaper', 'newspapers'],
  ['schilderij', 'painting', 'paintings'],
  ['foto', "foto's", 'photo', 'photograph', 'photographs'],
];

export const SEARCH_SYNONYMS: readonly (readonly string[])[] =
  RAW_SYNONYM_GROUPS.map((group) =>
    Array.from(new Set(group.map((term) => fold(term)))),
  );
