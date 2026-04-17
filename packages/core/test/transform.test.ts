import { describe, expect, it } from 'vitest';
import factory from 'rdf-ext';
import type { Literal, Quad, Term } from '@rdfjs/types';
import { dcat, dct, rdf, xsd } from '../src/query.ts';
import { normalizeTemporalCoverage } from '../src/transform.ts';

const ds = factory.namedNode('https://example.org/dataset');

function temporalQuad(value: string): Quad {
  return factory.quad(ds, dct('temporal'), factory.literal(value));
}

function findObject(quads: Quad[], predicate: Term): Term | undefined {
  return quads.find((q) => q.predicate.equals(predicate))?.object;
}

function startDate(quads: Quad[]): Literal | undefined {
  return findObject(quads, dcat('startDate')) as Literal | undefined;
}

function endDate(quads: Quad[]): Literal | undefined {
  return findObject(quads, dcat('endDate')) as Literal | undefined;
}

describe('normalizeTemporalCoverage', () => {
  it('rewrites a literal dct:temporal into a PeriodOfTime blank node', () => {
    const result = normalizeTemporalCoverage([temporalQuad('1939/1945')]);

    expect(result).toHaveLength(4);
    const link = findObject(result, dct('temporal'));
    expect(link?.termType).toBe('BlankNode');
    expect(findObject(result, rdf('type'))?.equals(dct('PeriodOfTime'))).toBe(
      true,
    );
    expect(startDate(result)?.value).toBe('1939');
    expect(endDate(result)?.value).toBe('1945');
  });

  it('types the dates as xsd:gYear for bare years', () => {
    const result = normalizeTemporalCoverage([temporalQuad('1939/1945')]);
    expect(startDate(result)?.datatype.equals(xsd('gYear'))).toBe(true);
  });

  it('types the dates as xsd:gYearMonth for YYYY-MM', () => {
    const result = normalizeTemporalCoverage([temporalQuad('1889-06/07')]);
    expect(startDate(result)?.datatype.equals(xsd('gYearMonth'))).toBe(true);
    expect(endDate(result)?.datatype.equals(xsd('gYearMonth'))).toBe(true);
  });

  it('types the dates as xsd:date for YYYY-MM-DD', () => {
    const result = normalizeTemporalCoverage([temporalQuad('2011-05-01')]);
    expect(startDate(result)?.datatype.equals(xsd('date'))).toBe(true);
  });

  it('types the dates as xsd:dateTime for YYYY-MM-DDTHH:MM:SS', () => {
    const result = normalizeTemporalCoverage([
      temporalQuad('2011-05-01T12:00:00'),
    ]);
    expect(startDate(result)?.datatype.equals(xsd('dateTime'))).toBe(true);
  });

  it('emits only dcat:startDate for open-ended right', () => {
    const result = normalizeTemporalCoverage([temporalQuad('2015-11/..')]);
    expect(startDate(result)?.value).toBe('2015-11');
    expect(endDate(result)).toBeUndefined();
  });

  it('emits only dcat:endDate for open-ended left', () => {
    const result = normalizeTemporalCoverage([temporalQuad('../2020')]);
    expect(startDate(result)).toBeUndefined();
    expect(endDate(result)?.value).toBe('2020');
  });

  it('leaves unparseable literals unchanged', () => {
    const quad = temporalQuad('circa 1900 — sometime');
    const result = normalizeTemporalCoverage([quad]);
    expect(result).toEqual([quad]);
  });

  it('passes IRI values through as-is', () => {
    const iriQuad = factory.quad(
      ds,
      dct('temporal'),
      factory.namedNode('https://n2t.net/ark:/99152/p0vrfvg'),
    );
    expect(normalizeTemporalCoverage([iriQuad])).toEqual([iriQuad]);
  });

  it('ignores quads with other predicates', () => {
    const other = factory.quad(
      ds,
      dct('title'),
      factory.literal('not a temporal', 'en'),
    );
    expect(normalizeTemporalCoverage([other])).toEqual([other]);
  });

  it('returns the input array reference when no temporal literals are present', () => {
    const title = factory.quad(
      ds,
      dct('title'),
      factory.literal('no temporal here', 'en'),
    );
    const input = [title];
    expect(normalizeTemporalCoverage(input)).toBe(input);
  });
});
