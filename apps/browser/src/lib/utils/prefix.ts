import { shrink } from '@zazuko/prefixes';

/**
 * Shortens a full URI to a prefixed name if a known prefix exists.
 * Falls back to the original URI if no prefix is found.
 */
export function shortenUri(uri: string): string {
  const shortened = shrink(uri, {
    aat: 'http://vocab.getty.edu/aat/',
    edm: 'http://www.europeana.eu/schemas/edm/',
    omekas: 'http://omeka.org/s/vocabs/o#',
    ore: 'https://openarchives.org/ore/terms/',
    pico: 'https://personsincontext.org/model#',
    pnv: 'https://w3id.org/pnv#',
    sdo: 'https://schema.org/',
  });
  return shortened || uri;
}

/**
 * Strips common URL prefixes (https://www., http://www., https://, http://).
 * @example stripUrlPrefix('https://www.example.com/path') => 'example.com/path'
 */
export function stripUrlPrefix(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, '');
}

/**
 * Truncates a string in the middle if it exceeds maxLength.
 * Shows beginning and end with ellipsis in the middle.
 * @example truncateMiddle('sdo:hasExactMatch', 12) => 'sdo:h…Match'
 */
export function truncateMiddle(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  const charsToShow = maxLength - 1; // -1 for ellipsis
  const frontChars = Math.ceil(charsToShow / 2);
  const backChars = Math.floor(charsToShow / 2);
  return str.slice(0, frontChars) + '…' + str.slice(-backChars);
}

const EU_LANGUAGE_PREFIX =
  'http://publications.europa.eu/resource/authority/language/';

const languageLabels: Record<string, Record<string, string>> = {
  NLD: { nl: 'Nederlands', en: 'Dutch' },
  ENG: { nl: 'Engels', en: 'English' },
  DEU: { nl: 'Duits', en: 'German' },
  FRA: { nl: 'Frans', en: 'French' },
  FRY: { nl: 'Fries', en: 'Frisian' },
  LAT: { nl: 'Latijn', en: 'Latin' },
  SPA: { nl: 'Spaans', en: 'Spanish' },
  ITA: { nl: 'Italiaans', en: 'Italian' },
  POR: { nl: 'Portugees', en: 'Portuguese' },
};

/**
 * Converts an EU Language Authority URI to a human-readable label.
 * Falls back to the language code if no label is found, or returns
 * the original value if it's not an EU URI.
 */
export function languageLabel(value: string, locale = 'nl'): string {
  if (!value.startsWith(EU_LANGUAGE_PREFIX)) return value;
  const code = value.slice(EU_LANGUAGE_PREFIX.length);
  return languageLabels[code]?.[locale] ?? code;
}

const IANA_MEDIA_TYPES_PREFIX = 'https://www.iana.org/assignments/media-types/';

/**
 * Strips the IANA media types prefix from a media type URI.
 * Returns the bare media type (e.g., 'application/n-triples+gzip').
 */
export function stripIanaPrefix(mediaType: string): string {
  if (mediaType.startsWith(IANA_MEDIA_TYPES_PREFIX)) {
    return mediaType.slice(IANA_MEDIA_TYPES_PREFIX.length);
  }
  return mediaType;
}
