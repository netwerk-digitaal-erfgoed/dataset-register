import { shrink } from '@zazuko/prefixes';

/**
 * Shortens a full URI to a prefixed name if a known prefix exists.
 * Falls back to the original URI if no prefix is found.
 */
export function shortenUri(uri: string): string {
  const shortened = shrink(uri, {
    omekas: 'http://omeka.org/s/vocabs/o#',
    pico: 'https://personsincontext.org/model#',
    pnv: 'https://w3id.org/pnv#',
    sdo: 'https://schema.org/',
  });
  return shortened || uri;
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
