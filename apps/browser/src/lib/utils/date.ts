import { getLocale } from '$lib/paraglide/runtime';

/**
 * Formats a date with its month spelled out in the current locale (for example
 * “3 februari 2026” or “February 3, 2026”), so day and month can never be
 * confused.
 */
export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString(getLocale(), dateFormat);
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
