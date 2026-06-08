import { describe, expect, it } from 'vitest';
import {
  isRdfDistribution,
  isSparqlDistribution,
  offersLinkedData,
  SPARQL_PROTOCOL,
} from './distribution';

describe('isSparqlDistribution', () => {
  it('is true when conformsTo lists the SPARQL 1.1 Protocol', () => {
    expect(isSparqlDistribution({ conformsTo: [SPARQL_PROTOCOL] })).toBe(true);
    // The protocol URI may sit alongside other conformance claims.
    expect(
      isSparqlDistribution({
        conformsTo: [
          'https://www.w3.org/TR/rdf-sparql-query/',
          SPARQL_PROTOCOL,
        ],
      }),
    ).toBe(true);
  });

  it('is false without the protocol or without conformsTo', () => {
    expect(isSparqlDistribution({ conformsTo: ['http://example.org/x'] })).toBe(
      false,
    );
    expect(isSparqlDistribution({})).toBe(false);
  });
});

describe('isRdfDistribution', () => {
  it('is true for a bare RDF media type', () => {
    expect(isRdfDistribution({ mediaType: 'text/turtle' })).toBe(true);
    expect(isRdfDistribution({ mediaType: 'application/ld+json' })).toBe(true);
    expect(isRdfDistribution({ mediaType: 'application/n-triples+gzip' })).toBe(
      true,
    );
  });

  it('is false for a non-RDF media type or none', () => {
    expect(isRdfDistribution({ mediaType: 'text/xml' })).toBe(false);
    expect(isRdfDistribution({ mediaType: null })).toBe(false);
    expect(isRdfDistribution({})).toBe(false);
  });

  it('expects normalized media types, not raw IANA IRIs', () => {
    // Media types are normalized to their bare form upstream by the card and
    // detail SPARQL queries (normalizeMediaType), so the helper deliberately
    // matches only bare types. A raw IANA IRI here means normalization was
    // skipped — which is the bug this contract guards against.
    expect(
      isRdfDistribution({
        mediaType: 'https://www.iana.org/assignments/media-types/text/turtle',
      }),
    ).toBe(false);
  });
});

describe('offersLinkedData', () => {
  it('is true when any distribution is a SPARQL endpoint or RDF download', () => {
    expect(
      offersLinkedData([
        { mediaType: 'text/csv' },
        { mediaType: 'text/turtle' },
      ]),
    ).toBe(true);
    expect(
      offersLinkedData([
        { mediaType: 'application/zip' },
        { conformsTo: [SPARQL_PROTOCOL] },
      ]),
    ).toBe(true);
  });

  it('is false when no distribution offers linked data', () => {
    expect(
      offersLinkedData([
        { mediaType: 'text/csv' },
        { mediaType: 'application/zip' },
      ]),
    ).toBe(false);
    expect(offersLinkedData([])).toBe(false);
  });
});
