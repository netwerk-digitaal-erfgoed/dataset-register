import { Client, Errors } from 'typesense';
import { DataFactory } from 'n3';
import type { Quad } from '@rdfjs/types';
import { BlueGreenRebuild, RebuildAlreadyRunning } from '@lde/search-typesense';
import {
  projectGraph,
  type SearchDocument,
  type SearchSchema,
  type SearchType,
} from '@lde/search';
import { Dataset } from '@lde/dataset';
import type { RunContext } from '@lde/pipeline';

/**
 * Build the typed per-type label collections (ADR 0008): one Typesense
 * collection per label-source `SearchType` (Organization / Class /
 * TerminologySource), so the query engine resolves each reference field’s
 * display label from its own collection by IRI. Replaces the single mixed
 * `labels` sidecar.
 *
 * Each collection is rebuilt blue/green through {@link BlueGreenRebuild} – the
 * same versioned-swap + cross-pod lock the `datasets` rebuild uses – so a label
 * rebuild is single-flight across pods (unlike the previous hand-rolled sidecar
 * swap, which held no lock).
 */

const { literal, namedNode, quad } = DataFactory;

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

/**
 * The synthetic source each label document is stamped with. Blue/green stamps a
 * per-document source for its per-source rollback bookkeeping; the label
 * rebuilds have no per-subject lifecycle (the whole collection is rebuilt in one
 * pass), so one stable synthetic stamp suffices.
 */
const LABEL_SOURCE = new Dataset({
  iri: new URL('urn:dr:label-index'),
  distributions: [],
});

/**
 * Rebuild one typed label collection from its label quads.
 *
 * The source readers emit bare `?subject <labelPredicate> ?literal` pairs with
 * no `rdf:type`, but {@link projectGraph} frames roots by `rdf:type`, so a
 * `?subject a <type>` triple is injected per subject before projecting. The
 * projection is scoped to a single-type schema (`projectGraph` projects every
 * root type in the schema it is handed) built by the same direct-map cast the
 * dataset projection uses – `searchSchema` cannot mint a one-type schema whose
 * label field is resolvable in isolation.
 *
 * Non-critical by design: labels are display-only, so any failure is logged and
 * swallowed rather than aborting the (already live) dataset index. An empty
 * projection over an existing collection keeps the previous labels rather than
 * swapping in an empty one – a transient DKG gap would otherwise strip the class
 * and terminology-source labels down to bare IRIs until the next run.
 */
export async function rebuildLabelCollection(
  client: Client,
  type: SearchType,
  alias: string,
  labelQuads: readonly Quad[],
  log: (message: string) => void,
): Promise<void> {
  try {
    const documents = await projectLabelDocuments(labelQuads, type);
    if (documents.length === 0 && (await aliasExists(client, alias))) {
      log(
        `Label index ${alias} skipped: no ${type.name} labels; keeping the current collection`,
      );
      return;
    }

    const writer = new BlueGreenRebuild<SearchDocument>(client, type, {
      name: alias,
      // Dutch-stem the folded `label_search_*` companion fields, matching the
      // dataset collection; the label texts are per-locale (nl/en) but a folded
      // fallback with no locale of its own would otherwise ship unstemmed.
      defaultLocale: 'nl',
    });
    const run = await writer.openRun(runContext());
    try {
      await run.write(LABEL_SOURCE, toAsyncIterable(documents));
      await run.commit();
    } catch (error) {
      await run.abort(error);
      throw error;
    }
    log(`Indexed ${documents.length} ${type.name} labels; alias ${alias}`);
  } catch (error) {
    if (error instanceof RebuildAlreadyRunning) {
      log(`Label index ${alias} skipped: another rebuild is already running`);
      return;
    }
    log(`Label index ${alias} skipped: ${(error as Error).message}`);
  }
}

/**
 * Prepare the raw label quads for projection into a typed label collection.
 *
 * Two transforms, both needed because the readers emit bare, often untagged
 * `?subject <labelPredicate> ?literal` pairs while the label-source `SearchType`
 * frames by `rdf:type` and only projects its declared locales (`nl`/`en`):
 *
 * 1. Inject a `?subject rdf:type <typeIri>` triple per subject so
 *    {@link projectGraph}/`frameByType` finds the label roots.
 * 2. Re-tag each subject’s label into explicit `@nl` and `@en` values with the
 *    same locale fallback the previous sidecar applied (nl → en → first value of
 *    any language), so a label that is untagged or tagged only in some other
 *    language (the common case for `foaf:name`/`dct:title`) still resolves in
 *    both locales instead of being dropped as neither `nl` nor `en`.
 */
export function prepareLabelQuads(
  labelQuads: readonly Quad[],
  typeIri: string,
): Quad[] {
  const rdfType = namedNode(RDF_TYPE);
  const typeNode = namedNode(typeIri);

  // Per subject: the first literal seen per language (`''` for untagged), and
  // the subject term to re-emit against, in first-seen order.
  const bySubject = new Map<
    string,
    {
      subject: Quad['subject'];
      predicate: Quad['predicate'];
      byLanguage: Map<string, string>;
    }
  >();
  for (const labelQuad of labelQuads) {
    if (labelQuad.object.termType !== 'Literal') {
      continue;
    }
    const key = labelQuad.subject.value;
    const entry = bySubject.get(key);
    if (entry === undefined) {
      bySubject.set(key, {
        subject: labelQuad.subject,
        predicate: labelQuad.predicate,
        byLanguage: new Map([
          [labelQuad.object.language, labelQuad.object.value],
        ]),
      });
    } else if (!entry.byLanguage.has(labelQuad.object.language)) {
      entry.byLanguage.set(labelQuad.object.language, labelQuad.object.value);
    }
  }

  const prepared: Quad[] = [];
  for (const { subject, predicate, byLanguage } of bySubject.values()) {
    prepared.push(quad(subject, rdfType, typeNode));
    // The last-resort value for a missing locale, matching the previous sidecar’s
    // default (nl → en → first value of any language). Falling back to the
    // first-seen value – not only the untagged one – keeps a subject labelled
    // solely in some other language (e.g. `@fr`) from rendering as a bare IRI;
    // an untagged-only subject still yields both `label_nl` and `label_en`.
    const fallback =
      byLanguage.get('nl') ??
      byLanguage.get('en') ??
      byLanguage.values().next().value;
    const nl = byLanguage.get('nl') ?? fallback;
    const en = byLanguage.get('en') ?? fallback;
    if (nl !== undefined) {
      prepared.push(quad(subject, predicate, literal(nl, 'nl')));
    }
    if (en !== undefined) {
      prepared.push(quad(subject, predicate, literal(en, 'en')));
    }
  }
  return prepared;
}

/**
 * Project the label quads for one label-source type into its collection
 * documents. The collection is bounded (organizations, classes, terminology
 * sources), so materializing into an array to count and emptiness-check is cheap.
 */
async function projectLabelDocuments(
  labelQuads: readonly Quad[],
  type: SearchType,
): Promise<SearchDocument[]> {
  const prepared = prepareLabelQuads(labelQuads, type.class);
  const singleType = new Map([[type.class, type]]) as unknown as SearchSchema;
  const documents: SearchDocument[] = [];
  for await (const { document } of projectGraph(prepared, singleType)) {
    documents.push(document);
  }
  return documents;
}

async function* toAsyncIterable(
  documents: readonly SearchDocument[],
): AsyncIterable<SearchDocument> {
  for (const document of documents) {
    yield document;
  }
}

/** Whether an alias currently resolves to a collection (a populated index). */
async function aliasExists(client: Client, alias: string): Promise<boolean> {
  try {
    await client.aliases(alias).retrieve();
    return true;
  } catch (error) {
    if (error instanceof Errors.ObjectNotFound) {
      return false;
    }
    throw error;
  }
}

/** A fresh {@link RunContext}: blue/green reads only `startedAt` to name the
 *  versioned collection and needs no selection scope (the swap sweeps nothing). */
function runContext(): RunContext {
  const startedAt = new Date().toISOString();
  return { runId: startedAt, startedAt, selectedSources: () => [] };
}
