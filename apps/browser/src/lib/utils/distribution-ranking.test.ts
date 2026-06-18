import { describe, expect, it } from 'vitest';
import {
  selectPreferredDownload,
  sortDistributionsByAvailability,
} from './distribution-ranking';
import type { DistributionHealth } from '$lib/services/distribution-health';
import { SPARQL_PROTOCOL } from '$lib/utils/distribution';

const now = new Date('2026-06-10T12:00:00Z');

// A reachability failure older than the 7-day threshold → unavailable.
const staleFailure: DistributionHealth = {
  lastOutcome: 'https://def.nde.nl/probe#NetworkError',
  lastProbedAt: now,
  lastSuccessAt: null,
  firstFailureAt: new Date('2026-05-01T12:00:00Z'),
  consecutiveFailures: 12,
  sourceFingerprint: null,
};

const healthy: DistributionHealth = {
  lastOutcome: null,
  lastProbedAt: now,
  lastSuccessAt: now,
  firstFailureAt: null,
  consecutiveFailures: 0,
  sourceFingerprint: null,
};

describe('selectPreferredDownload', () => {
  it('prefers a reachable distribution over an unavailable one of the same type', () => {
    const unavailable = {
      accessURL: 'https://example.org/empty.ttl',
      mediaType: 'text/turtle',
    };
    const reachable = {
      accessURL: 'https://example.org/works.ttl',
      mediaType: 'text/turtle',
    };
    const health = new Map([
      [unavailable.accessURL, staleFailure],
      [reachable.accessURL, healthy],
    ]);
    expect(selectPreferredDownload([unavailable, reachable], health, now)).toBe(
      reachable,
    );
  });

  it('prefers a valid distribution over a reachable-but-invalid one, but still offers the invalid bytes as a last resort', () => {
    const invalid = {
      accessURL: 'https://example.org/broken.ttl',
      mediaType: 'text/turtle',
    };
    const valid = {
      accessURL: 'https://example.org/good.ttl',
      mediaType: 'text/turtle',
    };
    const health = new Map([
      [invalid.accessURL, healthy],
      [valid.accessURL, healthy],
    ]);
    const invalidUrls = new Set([invalid.accessURL]);

    // A valid distribution wins even though both are reachable.
    expect(
      selectPreferredDownload([invalid, valid], health, now, invalidUrls),
    ).toBe(valid);
    // When the invalid one is the only reachable option, its bytes are still
    // offered rather than disabling the download.
    expect(selectPreferredDownload([invalid], health, now, invalidUrls)).toBe(
      invalid,
    );
  });

  it('applies type priority among reachable distributions (gzipped N-Triples wins over Turtle, Turtle over JSON-LD)', () => {
    const jsonLd = {
      accessURL: 'https://example.org/data.jsonld',
      mediaType: 'application/ld+json',
    };
    const turtle = {
      accessURL: 'https://example.org/data.ttl',
      mediaType: 'text/turtle',
    };
    const ntGzip = {
      accessURL: 'https://example.org/data.nt.gz',
      mediaType: 'application/n-triples+gzip',
    };
    // No health records: all unknown, hence all selectable.
    const health = new Map<string, DistributionHealth>();
    expect(selectPreferredDownload([jsonLd, turtle], health, now)).toBe(turtle);
    expect(selectPreferredDownload([jsonLd, turtle, ntGzip], health, now)).toBe(
      ntGzip,
    );
  });

  it('returns undefined when every distribution is unavailable', () => {
    const a = {
      accessURL: 'https://example.org/a.ttl',
      mediaType: 'text/turtle',
    };
    const b = {
      accessURL: 'https://example.org/b.nt',
      mediaType: 'application/n-triples',
    };
    const health = new Map([
      [a.accessURL, staleFailure],
      [b.accessURL, staleFailure],
    ]);
    expect(selectPreferredDownload([a, b], health, now)).toBeUndefined();
  });
});

describe('sortDistributionsByAvailability', () => {
  it('orders reachable distributions before unavailable ones', () => {
    const unavailable = {
      accessURL: 'https://example.org/empty.ttl',
      mediaType: 'text/turtle',
    };
    const reachable = {
      accessURL: 'https://example.org/works.ttl',
      mediaType: 'text/turtle',
    };
    const health = new Map([
      [unavailable.accessURL, staleFailure],
      [reachable.accessURL, healthy],
    ]);
    expect(
      sortDistributionsByAvailability([unavailable, reachable], health, now),
    ).toEqual([reachable, unavailable]);
  });

  it('uses type priority (SPARQL > RDF > other) as the secondary key', () => {
    const other = {
      accessURL: 'https://example.org/data.csv',
      mediaType: 'text/csv',
    };
    const rdf = {
      accessURL: 'https://example.org/data.ttl',
      mediaType: 'text/turtle',
    };
    const sparql = {
      accessURL: 'https://example.org/sparql',
      conformsTo: [SPARQL_PROTOCOL],
    };
    // All reachable (no health records), so only type priority orders them.
    const health = new Map<string, DistributionHealth>();
    expect(
      sortDistributionsByAvailability([other, rdf, sparql], health, now),
    ).toEqual([sparql, rdf, other]);
  });

  it('groups distributions with no health record with the reachable ones', () => {
    const noRecord = {
      accessURL: 'https://example.org/unknown.ttl',
      mediaType: 'text/turtle',
    };
    const unavailable = {
      accessURL: 'https://example.org/empty.ttl',
      mediaType: 'text/turtle',
    };
    const health = new Map([[unavailable.accessURL, staleFailure]]);
    expect(
      sortDistributionsByAvailability([unavailable, noRecord], health, now),
    ).toEqual([noRecord, unavailable]);
  });

  it('puts compressed downloads first (smaller to transfer), then the format preference', () => {
    const turtle = {
      accessURL: 'https://example.org/data.ttl',
      mediaType: 'text/turtle',
    };
    const jsonLd = {
      accessURL: 'https://example.org/data.jsonld',
      mediaType: 'application/ld+json',
    };
    const ntGzip = {
      accessURL: 'https://example.org/data.nt.gz',
      mediaType: 'application/n-triples+gzip',
    };
    const turtleGzip = {
      accessURL: 'https://example.org/data.ttl.gz',
      mediaType: 'text/turtle+gzip',
    };
    const health = new Map<string, DistributionHealth>();
    // Compressed first (N-Triples before Turtle by format preference), then the
    // uncompressed variants (Turtle before JSON-LD).
    expect(
      sortDistributionsByAvailability(
        [jsonLd, turtle, ntGzip, turtleGzip],
        health,
        now,
      ),
    ).toEqual([ntGzip, turtleGzip, turtle, jsonLd]);
  });
});

describe('selectPreferredDownload matches the topmost dropdown entry', () => {
  it('points at the compressed N-Triples that also sorts to the top', () => {
    const jsonLd = {
      accessURL: 'https://example.org/data.jsonld',
      mediaType: 'application/ld+json',
    };
    const turtle = {
      accessURL: 'https://example.org/data.ttl',
      mediaType: 'text/turtle',
    };
    const ntGzip = {
      accessURL: 'https://example.org/data.nt.gz',
      mediaType: 'application/n-triples+gzip',
    };
    const health = new Map<string, DistributionHealth>();
    const candidates = [jsonLd, turtle, ntGzip];
    const top = sortDistributionsByAvailability(candidates, health, now)[0];
    expect(selectPreferredDownload(candidates, health, now)).toBe(top);
    expect(selectPreferredDownload(candidates, health, now)).toBe(ntGzip);
  });

  it('skips an unavailable topmost entry and points at the next working one', () => {
    const ntGzip = {
      accessURL: 'https://example.org/data.nt.gz',
      mediaType: 'application/n-triples+gzip',
    };
    const turtle = {
      accessURL: 'https://example.org/data.ttl',
      mediaType: 'text/turtle',
    };
    // The otherwise-preferred compressed download is unavailable, so the button
    // falls through to the first reachable entry rather than a broken link.
    const health = new Map([[ntGzip.accessURL, staleFailure]]);
    expect(selectPreferredDownload([ntGzip, turtle], health, now)).toBe(turtle);
  });
});
