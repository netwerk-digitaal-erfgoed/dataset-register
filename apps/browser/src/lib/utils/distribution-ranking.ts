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

function isGzip(distribution: RankableDistribution): boolean {
  return (
    (distribution.mediaType?.includes('+gzip') ?? false) ||
    distribution.accessURL.endsWith('.gz')
  );
}

// The established download type priority: gzipped N-Triples first (smallest to
// transfer, fastest to parse), then any gzipped RDF, then Turtle, then JSON-LD,
// then any other RDF, falling back to the first candidate.
function pickByTypePriority<T extends RankableDistribution>(
  candidates: readonly T[],
): T | undefined {
  return (
    candidates.find(
      (d) => d.mediaType === 'application/n-triples' && isGzip(d),
    ) ??
    candidates.find((d) => isRdfDistribution(d) && isGzip(d)) ??
    candidates.find((d) => d.mediaType === 'text/turtle') ??
    candidates.find((d) => d.mediaType === 'application/ld+json') ??
    candidates.find(isRdfDistribution) ??
    candidates[0]
  );
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

// Select the distribution the default Download action should point at. Reachable
// (or not-yet-probed) distributions are preferred so the default download always
// works; among those the existing type priority decides. Returns undefined when
// every distribution is unavailable, which drives the disabled download state.
export function selectPreferredDownload<T extends RankableDistribution>(
  distributions: readonly T[],
  healthByUrl: ReadonlyMap<string, DistributionHealth>,
  now: Date,
): T | undefined {
  const selectable = distributions.filter(
    (distribution) =>
      availabilityOf(distribution, healthByUrl, now) !== 'unavailable',
  );
  if (selectable.length === 0) return undefined;
  return pickByTypePriority(selectable);
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
// access point first. Within an availability group the existing type priority
// (SPARQL > RDF > other) decides. Distributions with no health record group with
// the reachable ones. Returns a new array; the input is not mutated.
export function sortDistributionsByAvailability<T extends RankableDistribution>(
  distributions: readonly T[],
  healthByUrl: ReadonlyMap<string, DistributionHealth>,
  now: Date,
): T[] {
  const unavailableRank = (distribution: T): number =>
    availabilityOf(distribution, healthByUrl, now) === 'unavailable' ? 1 : 0;

  return [...distributions].sort(
    (a, b) =>
      unavailableRank(a) - unavailableRank(b) ||
      typePriority(b) - typePriority(a),
  );
}
