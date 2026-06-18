import type { CollectionCreateSchema } from 'typesense';
import type { SearchDocument } from '@lde/search';
import type { Quad } from '@rdfjs/types';

/**
 * One entry in the `labels` collection: a human-readable label for an IRI that
 * appears as a facet value (organizations, classes, terminology sources). The
 * IRI is the Typesense document `id`, so the browser resolves the labels for the
 * facet buckets currently on screen with a single `filter_by: id:[…]` lookup —
 * or pulls the whole (bounded) collection once and caches it. Faceting stays on
 * the IRI in the dataset document; this collection only supplies display text.
 * Typesense v30 can facet on a joined reference field, but we resolve labels
 * client-side instead: join faceting with `facet_return_parent` is still buggy
 * (typesense#2760, #2863) and locale selection happens client-side anyway.
 */
export interface LabelDocument extends SearchDocument {
  readonly id: string;
  readonly label: string;
  readonly label_nl?: string;
  readonly label_en?: string;
  /** Which facet the IRI belongs to (`organization`, `class`, …). */
  readonly type: string;
}

const DISPLAY_LOCALES = ['nl', 'en'] as const;

/**
 * Group label quads (`?iri <labelPredicate> ?literal`) into one document per
 * IRI, splitting language-tagged values into `label_${locale}` and choosing a
 * default `label` (Dutch first, then English, then any value) — the same
 * locale-fallback the browser applies when rendering a facet value.
 */
export function toLabelDocuments(
  quads: readonly Quad[],
  type: string,
): LabelDocument[] {
  // Per IRI: the label of each language seen, plus the very first value as the
  // last-resort fallback — tracked explicitly so the default label is always
  // present (no untyped `undefined` from an empty map to guard against).
  const byIri = new Map<
    string,
    { readonly byLanguage: Map<string, string>; readonly first: string }
  >();
  for (const quad of quads) {
    if (quad.object.termType !== 'Literal') {
      continue;
    }
    const language = quad.object.language;
    const entry = byIri.get(quad.subject.value);
    if (entry === undefined) {
      byIri.set(quad.subject.value, {
        byLanguage: new Map([[language, quad.object.value]]),
        first: quad.object.value,
      });
    } else if (!entry.byLanguage.has(language)) {
      // First value wins per language, matching the browser’s single-label render.
      entry.byLanguage.set(language, quad.object.value);
    }
  }

  const documents: LabelDocument[] = [];
  for (const [iri, { byLanguage, first }] of byIri) {
    const fallback = byLanguage.get('nl') ?? byLanguage.get('en') ?? first;
    const document: LabelDocument = { id: iri, label: fallback, type };
    for (const locale of DISPLAY_LOCALES) {
      const localized = byLanguage.get(locale);
      if (localized !== undefined) {
        (document as Record<string, unknown>)[`label_${locale}`] = localized;
      }
    }
    documents.push(document);
  }
  return documents;
}

/**
 * The `labels` collection schema. Tiny by design: the IRI is the document `id`,
 * `label` is the default display value, `label_${locale}` carry the per-locale
 * variants (display-only, not indexed for search), and `type` scopes a facet’s
 * labels so the browser can pull just one facet’s set when it wants to.
 */
export function buildLabelCollectionSchema(
  name: string,
): CollectionCreateSchema {
  return {
    name,
    fields: [
      { name: 'label', type: 'string' },
      { name: 'label_nl', type: 'string', optional: true, index: false },
      { name: 'label_en', type: 'string', optional: true, index: false },
      { name: 'type', type: 'string', facet: true },
    ],
  };
}
