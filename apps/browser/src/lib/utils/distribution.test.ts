import { describe, expect, it } from 'vitest';
import {
  getProtocolLabel,
  isApiDistribution,
  isRdfDistribution,
  isServiceDistribution,
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

  it('is true for the SPARQL query-language URI on its own', () => {
    // Some endpoints declare only the older query-language spec; it is a SPARQL
    // signal too, so it opens in the query editor rather than as a download.
    expect(
      isSparqlDistribution({
        conformsTo: ['https://www.w3.org/TR/rdf-sparql-query/'],
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

describe('isServiceDistribution / isApiDistribution', () => {
  it('treats SPARQL endpoints as services but not as APIs', () => {
    const sparql = { conformsTo: [SPARQL_PROTOCOL] };
    expect(isServiceDistribution(sparql)).toBe(true);
    expect(isApiDistribution(sparql)).toBe(false);
  });

  it('treats other recognised protocols as both services and APIs', () => {
    const openApi = {
      conformsTo: ['https://spec.openapis.org/oas/v3.2.0.html'],
    };
    expect(isServiceDistribution(openApi)).toBe(true);
    expect(isApiDistribution(openApi)).toBe(true);
    expect(
      isServiceDistribution({
        conformsTo: ['https://iiif.io/api/discovery/1.0/'],
      }),
    ).toBe(true);
  });

  it('does not treat data-model or serialization conformance as a service', () => {
    // EDM (a data model) and N-Triples (a serialization) occur in conformsTo on
    // plain RDF dumps; those are downloads, not endpoints.
    expect(
      isServiceDistribution({
        conformsTo: ['http://www.europeana.eu/schemas/edm/'],
        mediaType: 'application/rdf+xml',
      }),
    ).toBe(false);
    expect(
      isServiceDistribution({
        conformsTo: ['https://www.w3.org/TR/rdf12-n-triples/'],
        mediaType: 'application/n-triples',
      }),
    ).toBe(false);
    expect(isServiceDistribution({ mediaType: 'text/turtle' })).toBe(false);
  });
});

describe('getProtocolLabel', () => {
  it('returns the technical label for a recognised protocol', () => {
    expect(getProtocolLabel({ conformsTo: [SPARQL_PROTOCOL] })).toBe('SPARQL');
    expect(
      getProtocolLabel({
        conformsTo: ['https://spec.openapis.org/oas/v3.2.0.html'],
      }),
    ).toBe('REST API');
    expect(
      getProtocolLabel({ conformsTo: ['https://iiif.io/api/discovery/1.0/'] }),
    ).toBe('IIIF');
  });

  it('is undefined for an unrecognised or absent conformsTo', () => {
    expect(getProtocolLabel({ conformsTo: ['http://example.org/x'] })).toBe(
      undefined,
    );
    expect(getProtocolLabel({ mediaType: 'text/turtle' })).toBe(undefined);
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
