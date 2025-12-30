import { shrink } from '@zazuko/prefixes';

/**
 * Shortens a full URI to a prefixed name if a known prefix exists.
 * Falls back to the original URI if no prefix is found.
 */
export function shortenUri(uri: string): string {
  const shortened = shrink(uri, {
    edm: 'http://www.europeana.eu/schemas/edm/',
    omekas: 'http://omeka.org/s/vocabs/o#',
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
