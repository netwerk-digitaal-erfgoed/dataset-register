import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from 'lz-string';

// Compress validate-page paste content into a URL fragment value, and
// decompress legacy or current fragments back into text.
//
// Encoding uses browser-native `CompressionStream('deflate-raw')` plus
// base64url. Deflate's own LZ77 + Huffman comfortably beats lz-string on
// typical RDF: a ~3 kB Turtle paste shrinks from ~2 kB (lz-string) to
// ~1.2 kB. A static schema.org/DCAT dictionary was attempted but the
// dictionary bytes have to be carried in the compressed stream (raw
// deflate has no preset-dictionary header), so they cost more than they
// save at this payload size.
//
// Output format:
//   - `~1<base64url-payload>` — current format, deflate-raw + base64url.
//   - any other prefix — legacy lz-string output, decoded for backward
//     compatibility with URLs shared before this change.
//
// `~` is RFC 3986 unreserved and is not part of lz-string's alphabet,
// so the prefix disambiguates cleanly.

const FORMAT_PREFIX = '~1';

export async function encodeForShareUrl(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const compressed = await deflateRaw(bytes);
  return FORMAT_PREFIX + base64UrlEncode(compressed);
}

export async function decodeFromShareUrl(
  encoded: string,
): Promise<string | undefined> {
  if (encoded.startsWith(FORMAT_PREFIX)) {
    const payload = encoded.slice(FORMAT_PREFIX.length);
    const bytes = base64UrlDecode(payload);
    if (!bytes) return undefined;
    const inflated = await inflateRaw(bytes);
    if (!inflated) return undefined;
    return new TextDecoder().decode(inflated);
  }
  // Legacy lz-string fragments produced before the format prefix existed.
  const legacy = decompressFromEncodedURIComponent(encoded);
  return legacy || undefined;
}

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array | undefined> {
  try {
    const stream = new Blob([bytes as BlobPart])
      .stream()
      .pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return undefined;
  }
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value: string): Uint8Array | undefined {
  try {
    const padded =
      value.replace(/-/g, '+').replace(/_/g, '/') +
      '==='.slice((value.length + 3) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return undefined;
  }
}

// Exposed for diagnostic tooling that wants to compare formats. The form
// component should always go through `encodeForShareUrl`.
export const legacyEncodeForShareUrl = compressToEncodedURIComponent;
