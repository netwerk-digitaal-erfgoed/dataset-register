import {
  getLocale,
  localizeHref as localizeHrefDecorated,
  deLocalizeUrl as delocalizeUrlDecorated,
} from '$lib/paraglide/runtime';
import { encodeDatasetPath } from './dataset-uri';

/**
 * Extracts a localized string from a multilingual object.
 * Falls back to Dutch, then English, then the first available value.
 */
export function getLocalizedValue(
  values: Record<string, string> | undefined,
): string | null {
  if (!values) return null;

  const locale = getLocale();
  if (values[locale]) return values[locale];

  // Fallback to Dutch, then English, then first available
  if (values['nl']) return values['nl'];
  if (values['en']) return values['en'];

  return values[''] || null;
}

/**
 * Extracts a localized array from a multilingual array object.
 * With @multilang + @array, LDKit returns { lang: [values] } not [{ lang: value }].
 * Falls back to Dutch, then English, then the first available value.
 */
export function getLocalizedArray(
  values: Record<string, string[]> | undefined,
): string[] {
  if (!values) return [];

  const locale = getLocale();
  if (values[locale]) return values[locale];

  // Fallback to Dutch, then English, then first available
  if (values['nl']) return values['nl'];
  if (values['en']) return values['en'];

  return values[''] || [];
}

/**
 * Decorate the original localizeHref to work around a Paraglide bug that
 * corrupts "://" to ":/" in embedded URIs.
 *
 * Paraglide’s localizeHref uses .filter(Boolean) which removes empty path
 * segments, collapsing "://" to ":/" in dataset URIs. Encode before
 * localizeHref, then decode for clean URLs in the browser.
 */
export function localizeHref(
  href: string,
  options: { locale?: string },
): string {
  const encoded = encodeDatasetPath(href);
  const localized = localizeHrefDecorated(encoded, {
    locale: options?.locale ?? getLocale(),
  });

  return decodeURIComponent(localized);
}

/**
 * Decorate the original localizeHref to work around a Paraglide bug that
 * corrupts "://" to ":/" in embedded URIs.
 */
export function deLocalizeUrl(url: URL) {
  url.pathname = encodeDatasetPath(url.pathname);

  return delocalizeUrlDecorated(url);
}
