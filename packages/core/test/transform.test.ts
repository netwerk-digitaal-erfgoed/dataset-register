import { describe, expect, it } from 'vitest';
import factory from 'rdf-ext';
import type { Quad } from '@rdfjs/types';
import { normalizeTemporalCoverage } from '../src/transform.ts';

const ds = factory.namedNode('https://example.org/dataset');
const dctTemporal = factory.namedNode('http://purl.org/dc/terms/temporal');
const dctPeriodOfTime = factory.namedNode(
  'http://purl.org/dc/terms/PeriodOfTime',
);
const rdfType = factory.namedNode(
  'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
);
const dcatStartDate = factory.namedNode('http://www.w3.org/ns/dcat#startDate');
const dcatEndDate = factory.namedNode('http://www.w3.org/ns/dcat#endDate');
const xsd = (name: string) =>
  factory.namedNode(`http://www.w3.org/2001/XMLSchema#${name}`);

function temporalQuad(value: string): Quad {
  return factory.quad(ds, dctTemporal, factory.literal(value));
}

function startDate(quads: Quad[]) {
  return quads.find((q) => q.predicate.equals(dcatStartDate))?.object;
}

function endDate(quads: Quad[]) {
  return quads.find((q) => q.predicate.equals(dcatEndDate))?.object;
}

describe('normalizeTemporalCoverage', () => {
  it('rewrites a literal dct:temporal into a PeriodOfTime blank node', () => {
    const result = normalizeTemporalCoverage([temporalQuad('1939/1945')]);

    expect(result).toHaveLength(4);
    const link = result.find((q) => q.predicate.equals(dctTemporal));
    expect(link?.object.termType).toBe('BlankNode');
    const typed = result.find((q) => q.predicate.equals(rdfType));
    expect(typed?.object.equals(dctPeriodOfTime)).toBe(true);
    expect(startDate(result)?.value).toBe('1939');
    expect(endDate(result)?.value).toBe('1945');
  });

  it('types the dates as xsd:gYear for bare years', () => {
    const result = normalizeTemporalCoverage([temporalQuad('1939/1945')]);
    expect((startDate(result) as { datatype: { value: string } }).datatype.value).toBe(
      xsd('gYear').value,
    );
  });

  it('types the dates as xsd:gYearMonth for YYYY-MM', () => {
    const result = normalizeTemporalCoverage([temporalQuad('1889-06/07')]);
    expect((startDate(result) as { datatype: { value: string } }).datatype.value).toBe(
      xsd('gYearMonth').value,
    );
    expect((endDate(result) as { datatype: { value: string } }).datatype.value).toBe(
      xsd('gYearMonth').value,
    );
  });

  it('types the dates as xsd:date for YYYY-MM-DD', () => {
    const result = normalizeTemporalCoverage([temporalQuad('2011-05-01')]);
    expect((startDate(result) as { datatype: { value: string } }).datatype.value).toBe(
      xsd('date').value,
    );
  });

  it('types the dates as xsd:dateTime for YYYY-MM-DDTHH:MM:SS', () => {
    const result = normalizeTemporalCoverage([
      temporalQuad('2011-05-01T12:00:00'),
    ]);
    expect((startDate(result) as { datatype: { value: string } }).datatype.value).toBe(
      xsd('dateTime').value,
    );
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
      dctTemporal,
      factory.namedNode('https://n2t.net/ark:/99152/p0vrfvg'),
    );
    expect(normalizeTemporalCoverage([iriQuad])).toEqual([iriQuad]);
  });

  it('ignores quads with other predicates', () => {
    const other = factory.quad(
      ds,
      factory.namedNode('http://purl.org/dc/terms/title'),
      factory.literal('not a temporal', 'en'),
    );
    expect(normalizeTemporalCoverage([other])).toEqual([other]);
  });
});
