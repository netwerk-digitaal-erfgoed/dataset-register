import { getLocale } from '$lib/paraglide/runtime';

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
