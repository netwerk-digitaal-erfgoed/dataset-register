import { describe, expect, it } from 'vitest';
import { parseTemporalCoverage } from '../src/temporal-coverage.ts';

describe('parseTemporalCoverage', () => {
  describe('single points', () => {
    it.each([
      ['2011', '2011'],
      ['2011-05', '2011-05'],
      ['2011-05-01', '2011-05-01'],
      ['2011-05-01T12:00', '2011-05-01T12:00'],
      ['2011-05-01T12:00:00', '2011-05-01T12:00:00'],
    ])('%s → start=end=%s', (input, expected) => {
      expect(parseTemporalCoverage(input)).toEqual({
        start: expected,
        end: expected,
      });
    });
  });

  describe('ISO 8601 intervals', () => {
    it('accepts year/year', () => {
      expect(parseTemporalCoverage('2011/2012')).toEqual({
        start: '2011',
        end: '2012',
      });
    });

    it('accepts full-precision intervals', () => {
      expect(parseTemporalCoverage('2011-05-01/2012-06-30')).toEqual({
        start: '2011-05-01',
        end: '2012-06-30',
      });
    });

    it('expands shortened end (month → month)', () => {
      expect(parseTemporalCoverage('1889-06/07')).toEqual({
        start: '1889-06',
        end: '1889-07',
      });
    });

    it('expands shortened end (date → day)', () => {
      expect(parseTemporalCoverage('1889-06-15/20')).toEqual({
        start: '1889-06-15',
        end: '1889-06-20',
      });
    });
  });

  describe('open-ended intervals', () => {
    it('accepts trailing ..', () => {
      expect(parseTemporalCoverage('2015-11/..')).toEqual({ start: '2015-11' });
    });

    it('accepts leading ..', () => {
      expect(parseTemporalCoverage('../2020')).toEqual({ end: '2020' });
    });

    it('treats Dutch "heden" as open end', () => {
      expect(parseTemporalCoverage('1875 - heden')).toEqual({ start: '1875' });
    });

    it('treats English "present" / "now" as open end', () => {
      expect(parseTemporalCoverage('1875–present')).toEqual({ start: '1875' });
      expect(parseTemporalCoverage('1875 – now')).toEqual({ start: '1875' });
    });
  });

  describe('hyphen / dash range normalisation', () => {
    it('collapses bare year-year with hyphen', () => {
      expect(parseTemporalCoverage('1811-1930')).toEqual({
        start: '1811',
        end: '1930',
      });
    });

    it('collapses en-dash range', () => {
      expect(parseTemporalCoverage('1811–1930')).toEqual({
        start: '1811',
        end: '1930',
      });
    });

    it('collapses em-dash range', () => {
      expect(parseTemporalCoverage('1811—1930')).toEqual({
        start: '1811',
        end: '1930',
      });
    });

    it('collapses hyphen-with-spaces range', () => {
      expect(parseTemporalCoverage('1811 - 1930')).toEqual({
        start: '1811',
        end: '1930',
      });
    });

    it('leaves ISO dates (no surrounding spaces) untouched', () => {
      expect(parseTemporalCoverage('2011-05-01')).toEqual({
        start: '2011-05-01',
        end: '2011-05-01',
      });
    });
  });

  describe('BCE dates', () => {
    it('accepts single BCE year', () => {
      expect(parseTemporalCoverage('-0500')).toEqual({
        start: '-0500',
        end: '-0500',
      });
    });

    it('accepts BCE-to-BCE interval', () => {
      expect(parseTemporalCoverage('-0753/-0410')).toEqual({
        start: '-0753',
        end: '-0410',
      });
    });

    it('accepts BCE-to-CE interval', () => {
      expect(parseTemporalCoverage('-0753/0476')).toEqual({
        start: '-0753',
        end: '0476',
      });
    });
  });

  describe('approximation prefixes', () => {
    it('strips "ca."', () => {
      expect(parseTemporalCoverage('ca. 1900')).toEqual({
        start: '1900',
        end: '1900',
      });
    });

    it('strips "circa"', () => {
      expect(parseTemporalCoverage('circa 1900')).toEqual({
        start: '1900',
        end: '1900',
      });
    });
  });

  describe('unparseable', () => {
    it.each([
      '',
      '   ',
      'sometime',
      '2011-5', // single-digit month
      '2011-05-1', // single-digit day
      'ca. 6500 v.Chr.', // unsupported locale suffix
    ])('returns null for %j', (input) => {
      expect(parseTemporalCoverage(input)).toBeNull();
    });
  });
});
