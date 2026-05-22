import {
  getLocale,
  localizeHref as localizeHrefDecorated,
  deLocalizeUrl as delocalizeUrlDecorated,
  type Locale,
} from '$lib/paraglide/runtime';

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

export function localizeHref(
  href: string,
  options?: { locale?: Locale },
): string {
  return localizeHrefDecorated(href, {
    locale: options?.locale ?? getLocale(),
  });
}

export function deLocalizeUrl(url: URL) {
  return delocalizeUrlDecorated(url);
}
