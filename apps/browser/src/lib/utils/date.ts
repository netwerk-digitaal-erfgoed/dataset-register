import { getLocale } from '$lib/paraglide/runtime';

/**
 * Formats a date with its month spelled out in the current locale (for example
 * “3 februari 2026” or “February 3, 2026”), so day and month can never be
 * confused.
 *
 * A date-only string such as “2024-01-15” is a calendar date, not an instant:
 * it is shown as written, whatever the viewer’s timezone. A Date or a timestamp
 * string is an instant and is shown in the viewer’s timezone.
 */
export function formatDate(date: Date | string): string {
  const options = isDateOnly(date)
    ? { ...dateFormat, timeZone: 'UTC' }
    : dateFormat;
  return new Date(date).toLocaleDateString(getLocale(), options);
}

/**
 * Formats a timestamp like {@link formatDate}, followed by the time of day.
 */
export function formatDateTime(date: Date | string): string {
  return new Date(date).toLocaleDateString(getLocale(), {
    ...dateFormat,
    hour: '2-digit',
    minute: '2-digit',
  });
}

const dateFormat: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
};

// JavaScript parses a date-only ISO string as UTC midnight, so formatting it in
// UTC yields the calendar date as written.
function isDateOnly(date: Date | string): boolean {
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date);
}
