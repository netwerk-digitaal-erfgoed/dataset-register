import {
  distributionAvailability,
  type DistributionHealth,
} from '$lib/services/distribution-health';
import {
  isRdfDistribution,
  isSparqlDistribution,
} from '$lib/utils/distribution';

// The fields the ranking needs: the access URL to look up the distribution's
// health, plus the media type and conformance used for the type-priority
// ordering (SPARQL > RDF > other).
export interface RankableDistribution {
  accessURL: string;
  mediaType?: string | null;
  conformsTo?: readonly string[];
}

// The label suffix that marks a compressed download, or an empty string when the
// distribution is not compressed. gzip (`+gzip` media type or a .gz/.tgz URL) and
// zip (`application/zip` or a .zip URL) are recognised; both are smaller to
// transfer and so sort to the top. The suffix is reused as the human-facing label
// so a compressed variant is no longer indistinguishable from its plain sibling.
export function compressionSuffix(
  distribution: RankableDistribution,
): '' | ' (gzip)' | ' (zip)' {
  const mediaType = distribution.mediaType?.toLowerCase() ?? '';
  const url = distribution.accessURL.toLowerCase();
  if (mediaType.includes('gzip') || /\.(gz|gzip|tgz)$/.test(url)) {
    return ' (gzip)';
  }
  if (mediaType.includes('zip') || url.endsWith('.zip')) {
    return ' (zip)';
  }
  return '';
}

function isCompressed(distribution: RankableDistribution): boolean {
  return compressionSuffix(distribution) !== '';
}

// Media type without a `+gzip` suffix, lower-cased, so a compressed variant ranks
// by its underlying RDF serialization (e.g. `application/n-triples+gzip` ranks as
// N-Triples).
function baseMediaType(distribution: RankableDistribution): string {
  return (distribution.mediaType ?? '').toLowerCase().replace(/\+gzip$/, '');
}

// Preference among RDF serializations, smallest/fastest first: N-Triples and
// N-Quads (line-based, stream-parseable), then Turtle, then JSON-LD, then any
// other RDF, then non-RDF. Used to order variants within an availability and
// compression group so the list is deterministic and the best format leads.
function formatPriority(distribution: RankableDistribution): number {
  switch (baseMediaType(distribution)) {
    case 'application/n-triples':
      return 0;
    case 'application/n-quads':
      return 1;
    case 'text/turtle':
      return 2;
    case 'application/ld+json':
      return 3;
    default:
      return isRdfDistribution(distribution) ? 4 : 5;
  }
}

function availabilityOf(
  distribution: RankableDistribution,
  healthByUrl: ReadonlyMap<string, DistributionHealth>,
  now: Date,
) {
  return distributionAvailability(
    healthByUrl.get(distribution.accessURL) ?? null,
    now,
  );
}

// Select the distribution a default split-button action (Download or Query)
// should point at: the first reachable (or not-yet-probed) entry in the same
// order the dropdown renders, so the primary button always matches the topmost
// working option and the visitor never has to open the dropdown to find it. A
// distribution that is reachable but serves invalid RDF (in `invalidUrls`) is
// only offered as a last resort — a valid one is always preferred — but its
// bytes are still downloadable when it is the sole option. Returns undefined
// when every distribution is unavailable, which drives the disabled state of
// that action.
export function selectPreferredDistribution<T extends RankableDistribution>(
  distributions: readonly T[],
  healthByUrl: ReadonlyMap<string, DistributionHealth>,
  now: Date,
  invalidUrls: ReadonlySet<string> = new Set(),
): T | undefined {
  const reachable = sortDistributionsByAvailability(
    distributions,
    healthByUrl,
    now,
    invalidUrls,
  ).filter(
    (distribution) =>
      availabilityOf(distribution, healthByUrl, now) !== 'unavailable',
  );
  return (
    reachable.find(
      (distribution) => !invalidUrls.has(distribution.accessURL),
    ) ?? reachable[0]
  );
}

// Coarse type priority used for ordering the full distribution list:
// SPARQL endpoints first, then RDF downloads, then everything else.
function typePriority(distribution: RankableDistribution): number {
  if (isSparqlDistribution(distribution)) return 2;
  if (isRdfDistribution(distribution)) return 1;
  return 0;
}

// Order distributions availability-first: reachable (and not-yet-probed)
// distributions come before unavailable ones, so a visitor finds a working
// access point first. A reachable-but-invalid distribution (in `invalidUrls`)
// sorts after valid/unknown reachable ones but ahead of unavailable ones, so a
// usable download leads while the invalid bytes remain accessible lower down.
// Within a group: type priority (SPARQL > RDF > other), then compressed variants
// first (smaller to transfer, so they make the best default download), then the
// format preference, then a stable tie-break on the URL. Distributions with no
// health record group with the reachable ones. Returns a new array; the input is
// not mutated.
export function sortDistributionsByAvailability<T extends RankableDistribution>(
  distributions: readonly T[],
  healthByUrl: ReadonlyMap<string, DistributionHealth>,
  now: Date,
  invalidUrls: ReadonlySet<string> = new Set(),
): T[] {
  const unavailableRank = (distribution: T): number =>
    availabilityOf(distribution, healthByUrl, now) === 'unavailable' ? 1 : 0;
  const invalidRank = (distribution: T): number =>
    invalidUrls.has(distribution.accessURL) ? 1 : 0;

  return [...distributions].sort(
    (a, b) =>
      unavailableRank(a) - unavailableRank(b) ||
      invalidRank(a) - invalidRank(b) ||
      typePriority(b) - typePriority(a) ||
      Number(isCompressed(b)) - Number(isCompressed(a)) ||
      formatPriority(a) - formatPriority(b) ||
      a.accessURL.localeCompare(b.accessURL),
  );
}
