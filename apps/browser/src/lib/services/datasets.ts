import { dcat } from '@lde/dataset-registry-client';
import { dcterms, foaf } from 'ldkit/namespaces';
import { schemaNs as schema } from '../rdf.js';
import { getLocale } from '$lib/paraglide/runtime';
import {
  FORMAT_GROUP_RDF,
  FORMAT_GROUP_SPARQL,
  GROUP_PREFIX,
  RDF_MEDIA_TYPES,
  SPARQL_PROTOCOL_URI,
} from '@dataset-register/core/search';
import { type Facets, emptyFacets, mapFacets } from '$lib/services/facets';
import {
  type DatasetItem,
  type DatasetReference,
  localizedRecord,
  runDatasetSearch,
  type SearchLocale,
} from '$lib/services/search/datasets.js';

// Base distribution schema with common fields. Retained for the dataset detail
// page (dataset-detail.ts), which still reads distributions over SPARQL.
export const BaseDistributionSchema = {
  '@type': dcat.Distribution,
  mediaType: {
    '@id': dcat.mediaType,
    '@optional': true,
  },
  conformsTo: {
    '@id': dcterms.conformsTo,
    '@array': true,
    '@optional': true,
  },
} as const;

// Base dataset schema with fields shared between card and detail views. Retained
// for the dataset detail page (dataset-detail.ts), which extends it over SPARQL.
export const BaseDatasetSchema = {
  '@type': dcat.Dataset,
  title: {
    '@id': dcterms.title,
    '@multilang': true,
  },
  description: {
    '@id': dcterms.description,
    '@optional': true,
    '@multilang': true,
  },
  language: {
    '@id': dcterms.language,
    '@optional': true,
    '@array': true,
  },
  license: {
    '@id': dcterms.license,
    '@optional': true,
  },
  creator: {
    '@id': dcterms.creator,
    '@optional': true, // But required in DCAT-AP 3.0
    '@array': true,
    '@schema': {
      name: {
        '@id': foaf.name,
        '@multilang': true,
      },
    },
  },
  publisher: {
    '@id': dcterms.publisher,
    '@optional': true,
    '@schema': {
      name: {
        '@id': foaf.name,
        '@multilang': true,
      },
    },
  },
  status: {
    '@id': schema.status,
    '@optional': true,
  },
} as const;

export type OrderBy = 'title' | 'datePosted';

export interface SearchRequest {
  query?: string;
  publisher: string[];
  format: string[];
  class: string[];
  terminologySource: string[];
  catalog: string[];
  size: {
    min?: number;
    max?: number;
  };
  status: string[];
}

/**
 * A single distribution badge on a card: its bare media type (or null) and the
 * `dct:conformsTo` IRIs. Derived from the search document’s `format` and
 * `format_group` fields, mirroring the previous SPARQL-backed shape so the card
 * keeps detecting SPARQL/RDF distributions identically.
 */
export interface CardDistribution {
  mediaType: string | null;
  conformsTo: string[];
}

/**
 * The card view-model, mapped from one Typesense {@link SearchHitDocument}.
 * Multilingual fields are `{nl, en}` records so the card’s `getLocalizedValue`
 * keeps working unchanged.
 */
export interface DatasetCard {
  $id: string;
  title: Record<string, string>;
  description?: Record<string, string>;
  language: string[];
  publisher?: { $id: string; name: Record<string, string> };
  status?: string;
  size?: number;
  datePosted?: Date;
  distribution: CardDistribution[];
  iiif: boolean;
  iiif_manifest_count?: number;
  nde_schema_ap: boolean;
}

// Whether the dataset provides working IIIF media: the DKG validated the
// declared manifests (or none were sampled yet). Indexed as a boolean
// (`iiif === true`); the card gates the icon on this.
export function providesWorkingIiif(dataset: DatasetCard): boolean {
  return dataset.iiif === true;
}

// The declared IIIF manifest count, indexed as `iiif_manifest_count` (sum of the
// IIIF `void:subset` `void:entities`). The card shows the count alongside the
// working-IIIF icon.
export function iiifManifestCount(dataset: DatasetCard): number {
  return dataset.iiif_manifest_count ?? 0;
}

// Whether the dataset conforms to the NDE Schema.org Application Profile in the
// sampled resources. Indexed as a boolean (`nde_schema_ap === true`).
export function conformsToSchemaApNde(dataset: DatasetCard): boolean {
  return dataset.nde_schema_ap === true;
}

export interface SearchResults {
  datasets: DatasetCard[];
  facets: Facets;
  total: number;
  time: number;
}

/**
 * Map a GraphQL {@link DatasetItem} to the {@link DatasetCard} view-model.
 * Localized text (title, description, publisher label) comes back best-first per
 * the request’s Accept-Language and is reshaped into the `{nl, en}` records the
 * card’s getLocalizedValue expects; the publisher label is already resolved by
 * the engine; the distribution badges are reconstructed from the `format`
 * field’s media types and `group:*` tokens.
 */
export function cardFromItem(item: DatasetItem): DatasetCard {
  // Title is required on the card; an item with no title (rare – the index
  // requires one) degrades to an empty record rather than crashing.
  const title = localizedRecord(item.title) ?? {};

  return {
    $id: item.id,
    title,
    description: localizedRecord(item.description),
    language: [...item.language],
    publisher: cardPublisher(item.publisher),
    status: item.status,
    size: item.size ?? undefined,
    datePosted:
      item.date_posted !== null ? new Date(item.date_posted) : undefined,
    distribution: cardDistributions(item.format),
    iiif: item.iiif === true,
    iiif_manifest_count: item.iiif_manifest_count ?? undefined,
    nde_schema_ap: item.nde_schema_ap === true,
  };
}

// The card’s (single, in practice) publisher: its IRI plus the engine-resolved
// `{nl, en}` label, falling back to the bare IRI when the reference has no label.
function cardPublisher(
  publishers: readonly DatasetReference[],
): DatasetCard['publisher'] {
  const publisher = publishers[0];
  if (publisher === undefined) {
    return undefined;
  }
  return {
    $id: publisher.id,
    name: localizedRecord(publisher.name) ?? { '': publisher.id },
  };
}

// Rebuild the card’s distribution badges from the `format` field, which now
// carries both granular media types and the `group:*` tokens: each media type
// becomes a badge, and the `group:sparql`/`group:rdf` tokens re-create the
// conformsTo / RDF media-type signals the card looks for.
function cardDistributions(format: readonly string[]): CardDistribution[] {
  const mediaTypes = format.filter((value) => !value.startsWith(GROUP_PREFIX));
  const groups = format.filter((value) => value.startsWith(GROUP_PREFIX));

  const distributions: CardDistribution[] = mediaTypes.map((mediaType) => ({
    mediaType,
    conformsTo: [],
  }));

  if (groups.includes(FORMAT_GROUP_SPARQL)) {
    distributions.push({ mediaType: null, conformsTo: [SPARQL_PROTOCOL_URI] });
  }
  if (
    groups.includes(FORMAT_GROUP_RDF) &&
    !distributions.some(
      (distribution) =>
        distribution.mediaType !== null &&
        (RDF_MEDIA_TYPES as readonly string[]).includes(distribution.mediaType),
    )
  ) {
    // Ensure an RDF media-type badge exists even if the granular `format` value
    // is absent, so the card’s RDF detection matches the grouped facet.
    distributions.push({ mediaType: RDF_MEDIA_TYPES[0], conformsTo: [] });
  }

  return distributions;
}

/**
 * Run a dataset listing search against the GraphQL API, mapping the hits to
 * cards and the facet buckets to the sidebar. One request returns the listing
 * and every facet (labels already resolved server-side). Returns empty results
 * (and logs) when the search fails – the SPARQL listing fallback is gone.
 *
 * `fetchImpl` is injected so a server-side caller (the RSS feed) can pass
 * SvelteKit’s `event.fetch`, which resolves the same-origin `/graphql` URL; the
 * browser omits it and uses the global `fetch`.
 */
export async function fetchDatasets(
  searchFilters: SearchRequest,
  limit: number,
  offset = 0,
  orderBy: OrderBy = 'title',
  fetchImpl?: typeof fetch,
): Promise<SearchResults> {
  const startTime = performance.now();
  const locale = getLocale() as SearchLocale;

  try {
    const result = await runDatasetSearch(
      searchFilters,
      { limit, offset, orderBy, locale },
      { fetchImpl },
    );
    return {
      datasets: result.items.map((item) => cardFromItem(item)),
      facets: mapFacets(result.facets),
      total: result.total,
      time: performance.now() - startTime,
    };
  } catch (error) {
    // A search-backend failure degrades to an empty listing rather than
    // stranding the page; the listing now requires the GraphQL backend.
    console.error('Failed to load datasets:', error);
    return {
      datasets: [],
      facets: emptyFacets(),
      total: 0,
      time: performance.now() - startTime,
    };
  }
}
