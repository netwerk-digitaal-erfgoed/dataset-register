import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatDate, formatDateTime } from './date';

vi.mock('$lib/paraglide/runtime', () => ({ getLocale: () => 'nl' }));

describe('formatDate', () => {
  const originalTimezone = process.env.TZ;

  beforeEach(() => {
    // A timezone west of UTC, where UTC midnight is still the previous day.
    process.env.TZ = 'America/New_York';
  });

  afterEach(() => {
    process.env.TZ = originalTimezone;
  });

  it('shows a date-only value as the calendar date written', () => {
    expect(formatDate('2024-01-15')).toBe('15 januari 2024');
  });

  it('shows a timestamp in the viewer’s timezone', () => {
    expect(formatDate('2024-01-15T03:00:00Z')).toBe('14 januari 2024');
    expect(formatDate(new Date('2024-01-15T03:00:00Z'))).toBe(
      '14 januari 2024',
    );
  });

  it('spells out the month', () => {
    expect(formatDate('2026-02-03')).toBe('3 februari 2026');
  });
});

describe('formatDateTime', () => {
  it('appends the time of day', () => {
    expect(formatDateTime('2024-01-15T13:05:00Z')).toMatch(
      /^15 januari 2024,? (om )?\d{2}:\d{2}$/,
    );
  });
});
