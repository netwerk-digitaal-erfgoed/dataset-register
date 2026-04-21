import { error, type RequestHandler } from '@sveltejs/kit';
import { lookup } from 'node:dns/promises';

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 5 * 1024 * 1024;

// Reject private/loopback/link-local/unique-local/IANA-reserved ranges to
// keep this proxy from being a plaintext SSRF primitive.
function isPrivateAddress(address: string): boolean {
  if (address.includes(':')) {
    const lower = address.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    if (
      lower.startsWith('fe80:') ||
      lower.startsWith('fc') ||
      lower.startsWith('fd')
    ) {
      return true;
    }
    if (lower.startsWith('::ffff:')) {
      return isPrivateAddress(lower.slice('::ffff:'.length));
    }
    return false;
  }
  const parts = address.split('.').map(Number);
  if (
    parts.length !== 4 ||
    parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
  ) {
    return true;
  }
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

export const GET: RequestHandler = async ({ url, fetch }) => {
  const target = url.searchParams.get('url');
  if (!target) error(400, 'Missing `url` query parameter');

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    error(400, 'Invalid URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    error(400, 'Only http/https URLs are supported');
  }

  try {
    const resolved = await lookup(parsed.hostname, { all: true });
    if (resolved.some((entry) => isPrivateAddress(entry.address))) {
      error(400, 'Host resolves to a private address');
    }
  } catch {
    error(502, 'Could not resolve host');
  }

  let response: Response;
  try {
    response = await fetch(parsed, {
      headers: {
        Accept:
          'application/ld+json, text/turtle;q=0.9, application/rdf+xml;q=0.8, application/n-triples;q=0.7, */*;q=0.1',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    error(
      502,
      err instanceof Error
        ? `Upstream fetch failed: ${err.message}`
        : 'Upstream fetch failed',
    );
  }

  if (!response.ok) error(502, `Upstream returned ${response.status}`);

  const reader = response.body?.getReader();
  if (!reader) error(502, 'Upstream returned an empty body');
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_BYTES) {
      await reader.cancel();
      error(413, 'Upstream body exceeds 5 MB');
    }
    chunks.push(value);
  }
  const body = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type':
        response.headers.get('content-type') ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    },
  });
};
