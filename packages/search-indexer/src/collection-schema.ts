import type { CollectionCreateSchema } from 'typesense';
import type { CollectionFieldSchema } from 'typesense/lib/Typesense/Collection.js';
import {
  DEFAULT_SORTING_FIELD,
  SEARCH_FIELDS,
  SEARCH_SYNONYM_SET,
  type SearchFieldSpec,
} from '@dataset-register/core';

/**
 * Build the Typesense collection schema from the shared field registry, so the
 * schema and the projector are driven by one declarative source and cannot
 * drift. Field types are written in Typesense’s vocabulary in the registry, so
 * this is a near-direct mapping.
 *
 * Stemming (`stem`) is enabled per locale on the folded `*_search_${locale}`
 * fields with that field’s `locale` (nl→Dutch, en→English Snowball): a field has
 * one `locale` hence one stemmer, so per-locale fields stem both languages
 * correctly. Pre-folding makes the non-default locale’s diacritic preservation
 * moot, so the values stay diacritic-insensitive.
 */
export function buildCollectionSchema(name: string): CollectionCreateSchema {
  return {
    name,
    fields: SEARCH_FIELDS.map(toTypesenseField),
    default_sorting_field: DEFAULT_SORTING_FIELD,
    // Reference the live synonym set; its items are synced separately each run.
    synonym_sets: [SEARCH_SYNONYM_SET],
  };
}

function toTypesenseField(field: SearchFieldSpec): CollectionFieldSchema {
  const schema: CollectionFieldSchema = {
    name: field.name,
    type: field.type,
    facet: field.facet ?? false,
    optional: field.optional ?? false,
    sort: field.sort ?? false,
  };
  if (field.index === false) {
    schema.index = false;
  }
  if (field.stem) {
    schema.stem = true;
  }
  if (field.locale !== undefined) {
    schema.locale = field.locale;
  }
  return schema;
}
