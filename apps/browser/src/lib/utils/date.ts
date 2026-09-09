import { getLocale } from '$lib/paraglide/runtime';

const dateFormat: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
};

/**
 * Formats a date with its month spelled out (for example “3 February 2026”),
 * so day and month can never be confused, in the current locale.
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
