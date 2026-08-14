import { Client, Errors } from 'typesense';
import { DataFactory } from 'n3';
import type { Quad } from '@rdfjs/types';
import { BlueGreenRebuild, RebuildAlreadyRunning } from '@lde/search-typesense';
import {
  projectRoots,
  type RootType,
  type SearchDocument,
} from '@lde/search';
import { Dataset } from '@lde/dataset';
import { SEARCH_SCHEMA } from '@dataset-register/core';
import { irAlias, labelFieldOf } from '@lde/search/adapter';
import { RDF_TYPE, rootsOfClass } from './roots.js';
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
 * no `rdf:type`, so a `?subject a <type>` triple is injected per subject before
 * projecting: it is what names this rebuild’s roots ({@link rootsOfClass}) and
 * what frames each subject as an instance of its label-source type.
 *
 * Non-critical by design: labels are display-only, so any failure is logged and
 * swallowed rather than aborting the (already live) dataset index. An empty
 * projection over an existing collection keeps the previous labels rather than
 * swapping in an empty one – a transient DKG gap would otherwise strip the class
 * and terminology-source labels down to bare IRIs until the next run.
 */
export async function rebuildLabelCollection(
  client: Client,
  type: RootType,
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
 * 1. Inject a `?subject rdf:type <typeIri>` triple per subject, which names the
 *    label roots ({@link rootsOfClass}) and frames them.
 * 2. Re-tag each subject’s label into explicit `@nl` and `@en` values with the
 *    same locale fallback the previous sidecar applied (nl → en → first value of
 *    any language), so a label that is untagged or tagged only in some other
 *    language (the common case for `foaf:name`/`dct:title`) still resolves in
 *    both locales instead of being dropped as neither `nl` nor `en`.
 */
export function prepareLabelQuads(
  labelQuads: readonly Quad[],
  type: RootType,
): Quad[] {
  const rdfType = namedNode(RDF_TYPE);
  const typeNode = namedNode(type.class);
  // The projection reads a field back under its IR Alias, not under the source
  // predicate the readers emit (`foaf:name`, `rdfs:label`, `dct:title`), so the
  // re-tagged labels are minted onto the alias of this type’s label field.
  const labelField = labelFieldOf(type);
  if (labelField === undefined) {
    throw new Error(`${type.name} declares no label field to project into.`);
  }
  const labelAlias = namedNode(irAlias(type, labelField));

  // Per subject: the first literal seen per language (`''` for untagged), and
  // the subject term to re-emit against, in first-seen order.
  const bySubject = new Map<
    string,
    {
      subject: Quad['subject'];
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
        byLanguage: new Map([
          [labelQuad.object.language, labelQuad.object.value],
        ]),
      });
    } else if (!entry.byLanguage.has(labelQuad.object.language)) {
      entry.byLanguage.set(labelQuad.object.language, labelQuad.object.value);
    }
  }

  const prepared: Quad[] = [];
  for (const { subject, byLanguage } of bySubject.values()) {
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
      prepared.push(quad(subject, labelAlias, literal(nl, 'nl')));
    }
    if (en !== undefined) {
      prepared.push(quad(subject, labelAlias, literal(en, 'en')));
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
  type: RootType,
): Promise<SearchDocument[]> {
  const prepared = prepareLabelQuads(labelQuads, type);
  const documents: SearchDocument[] = [];
  for await (const document of projectRoots(
    prepared,
    rootsOfClass(prepared, type.class),
    SEARCH_SCHEMA,
    type,
  )) {
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
