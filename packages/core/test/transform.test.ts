import { describe, expect, it } from 'vitest';
import factory from 'rdf-ext';
import type { Literal, Quad, Term } from '@rdfjs/types';
import { dcat, dct, rdf, vcard, xsd } from '../src/query.ts';
import {
  keepOneContactPoint,
  normalizeTemporalCoverage,
} from '../src/transform.ts';

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

describe('keepOneContactPoint', () => {
  function contactPoint(
    id: string,
    emails: string[] = [],
    name?: string,
  ): Quad[] {
    const node = factory.blankNode(id);
    return [
      factory.quad(ds, dcat('contactPoint'), node),
      factory.quad(node, rdf('type'), vcard('Kind')),
      ...emails.map((email) =>
        factory.quad(
          node,
          vcard('hasEmail'),
          factory.namedNode(`mailto:${email}`),
        ),
      ),
      ...(name ? [factory.quad(node, vcard('fn'), factory.literal(name))] : []),
    ];
  }

  function kept(quads: Quad[]): string | undefined {
    return findObject(quads, dcat('contactPoint'))?.value;
  }

  it('keeps the contact point with the lowest email, whatever the input order', () => {
    const help = contactPoint('help', ['help@example.com'], 'Helpdesk');
    const data = contactPoint('data', ['data@example.com'], 'Datamanager');

    for (const quads of [
      [...help, ...data],
      [...data, ...help],
    ]) {
      const result = keepOneContactPoint(quads);
      expect(kept(result)).toBe('data');
      expect(result).toEqual(data);
    }
  });

  it('breaks an email tie on name, then on node value', () => {
    expect(
      kept(
        keepOneContactPoint([
          ...contactPoint('a', ['data@example.com'], 'Zeta'),
          ...contactPoint('b', ['data@example.com'], 'Alpha'),
        ]),
      ),
    ).toBe('b');
    expect(
      kept(keepOneContactPoint([...contactPoint('b'), ...contactPoint('a')])),
    ).toBe('a');
  });

  it('compares a contact point with several emails by its lowest', () => {
    const result = keepOneContactPoint([
      ...contactPoint('one', ['beta@example.com']),
      ...contactPoint('several', [
        'zeta@example.com',
        'alpha@example.com',
        'omega@example.com',
      ]),
    ]);
    expect(kept(result)).toBe('several');
  });

  it('prefers a contact point with an email over one without, whatever the input order', () => {
    const withoutEmail = contactPoint('without', [], 'Helpdesk');
    const withEmail = contactPoint('with', ['data@example.com'], 'Data');
    for (const quads of [
      [...withoutEmail, ...withEmail],
      [...withEmail, ...withoutEmail],
    ]) {
      expect(kept(keepOneContactPoint(quads))).toBe('with');
    }
  });

  it('counts a contact point linked twice as one', () => {
    const quads = [
      ...contactPoint('only', ['data@example.com']),
      factory.quad(ds, dcat('contactPoint'), factory.blankNode('only')),
    ];
    expect(keepOneContactPoint(quads)).toBe(quads);
  });

  it('returns the input array reference when no subject has more than one contact point', () => {
    const quads = contactPoint('only', ['data@example.com']);
    expect(keepOneContactPoint(quads)).toBe(quads);
  });
});
