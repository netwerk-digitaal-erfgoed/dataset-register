/** The locales the `labels` collection carries per-locale variants for. */
export type LabelLocale = 'nl' | 'en';

/**
 * One entry of the sidecar `labels` collection, mirroring the indexer’s
 * `LabelDocument`: an IRI (`id`) with a default `label` and optional per-locale
 * variants.
 */
interface LabelDocument {
  readonly id: string;
  readonly label: string;
  readonly label_nl?: string;
  readonly label_en?: string;
  readonly type: string;
}

/**
 * Resolves facet-value IRIs to human-readable labels from the `labels`
 * collection. Callers depend on this interface, not on Typesense: it is the seam
 * a later GraphQL-backed implementation slots into without touching the UI.
 */
export interface LabelResolver {
  /**
   * Resolve `iris` to display labels for `locale`. IRIs absent from the
   * collection are omitted from the result, so the caller falls back to a
   * shortened IRI for any facet bucket without a label.
   */
  resolve(
    iris: Iterable<string>,
    locale: LabelLocale,
  ): Promise<Map<string, string>>;
  /** Drop the cached collection so the next {@link resolve} refetches it. */
  clear(): void;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000;

/**
 * Build a {@link LabelResolver} over a function that exports the `labels`
 * collection as JSONL.
 *
 * The whole (bounded) `labels` collection is pulled once and cached in memory
 * with a TTL, so resolving the facet buckets on a page is an in-memory lookup
 * with no per-request Typesense call; a blue/green rebuild is picked up when the
 * TTL lapses. A burst of concurrent first-loads shares a single export
 * (single-flight). The exporter is injected so the resolver is unit-testable
 * against a mock.
 */
export function createLabelResolver(
  exportDocuments: () => Promise<string>,
  options: { readonly ttlMs?: number } = {},
): LabelResolver {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  let cache:
    | { readonly loadedAt: number; readonly byIri: Map<string, LabelDocument> }
    | undefined;
  let inFlight: Promise<Map<string, LabelDocument>> | undefined;

  async function fetchAll(): Promise<Map<string, LabelDocument>> {
    const exported = await exportDocuments();
    const byIri = new Map<string, LabelDocument>();
    for (const line of exported.split('\n')) {
      if (line.length === 0) {
        continue;
      }
      const document = JSON.parse(line) as LabelDocument;
      byIri.set(document.id, document);
    }
    return byIri;
  }

  async function collection(): Promise<Map<string, LabelDocument>> {
    if (cache !== undefined && Date.now() - cache.loadedAt < ttlMs) {
      return cache.byIri;
    }
    // Single-flight: concurrent requests against a cold (or just-expired) cache
    // share one export rather than each firing its own.
    inFlight ??= fetchAll().then((byIri) => {
      cache = { loadedAt: Date.now(), byIri };
      return byIri;
    });
    try {
      return await inFlight;
    } finally {
      inFlight = undefined;
    }
  }

  return {
    async resolve(iris, locale) {
      let byIri: Map<string, LabelDocument>;
      try {
        byIri = await collection();
      } catch (error) {
        // Labels are display-only: if the collection can’t be loaded (a
        // transient Typesense error, or a search-only key lacking
        // `documents:export`), degrade to no labels so every caller falls back
        // to a shortened IRI — never failing the whole facet or dataset listing.
        console.error('Label resolution failed; falling back to bare IRIs:', error);
        return new Map();
      }
      const labels = new Map<string, string>();
      for (const iri of iris) {
        const document = byIri.get(iri);
        if (document !== undefined) {
          labels.set(iri, pickLabel(document, locale));
        }
      }
      return labels;
    },
    clear() {
      cache = undefined;
    },
  };
}

/**
 * The label for `locale`, falling back to the document’s default `label` (which
 * the indexer already set to the Dutch → English → first-seen value) when the
 * requested locale has no variant.
 */
function pickLabel(document: LabelDocument, locale: LabelLocale): string {
  const localized = locale === 'nl' ? document.label_nl : document.label_en;
  return localized ?? document.label;
}
