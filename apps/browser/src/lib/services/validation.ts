import { PUBLIC_API_ENDPOINT } from '$env/static/public';
import { COULD_NOT_FETCH_URL_PREFIX } from '@dataset-register/core/constants';
import { parseShaclReport, type ShaclReport } from './shacl-report.js';

export interface ApiErrorDetails {
  title?: string;
  description?: string;
}

/**
 * Pull the bare reason out of a CouldNotFetchUrl Hydra title.
 *
 * Title shape: `${COULD_NOT_FETCH_URL_PREFIX} <url>: <reason>`. Splitting on
 * ': ' (colon-space) avoids matching the colons inside the URL, since URLs
 * cannot contain ': '.
 */
export function fetchErrorReason(
  title: string | undefined,
): string | undefined {
  if (!title?.startsWith(COULD_NOT_FETCH_URL_PREFIX)) return undefined;
  const idx = title.indexOf(': ');
  return idx >= 0 ? title.slice(idx + 2) : undefined;
}

export type UrlValidationOutcome =
  | { kind: 'report'; report: ShaclReport }
  | { kind: 'not-found'; details?: ApiErrorDetails }
  | { kind: 'no-dataset'; details?: ApiErrorDetails }
  | { kind: 'fetch-failed'; details?: ApiErrorDetails }
  | { kind: 'error'; message: string };

export type InlineValidationOutcome =
  | { kind: 'report'; report: ShaclReport }
  | { kind: 'parse-error'; message: string }
  | { kind: 'no-dataset'; details?: ApiErrorDetails }
  | { kind: 'error'; message: string };

/** Progress of a streamed URL validation: distributions probed so far. */
export interface ValidationProgress {
  completed: number;
  total: number;
}

export async function validateByUrl(
  url: string,
  signal?: AbortSignal,
  onProgress?: (progress: ValidationProgress) => void,
): Promise<UrlValidationOutcome> {
  const response = await fetch(`${PUBLIC_API_ENDPOINT}/datasets/validate`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/ld+json',
      // Ask for a progress stream only when the caller wants progress updates;
      // other callers keep the simpler one-shot JSON-LD response.
      Accept: onProgress ? 'text/event-stream' : 'application/ld+json',
    },
    body: JSON.stringify({ '@id': url }),
    signal,
  });

  // The server streams progress only when it accepted the request and chose to;
  // resolve errors (404/406) still arrive as plain HTTP, so fall back on those.
  const contentType = response.headers.get('content-type') ?? '';
  if (
    onProgress &&
    response.ok &&
    contentType.includes('text/event-stream') &&
    response.body
  ) {
    return readValidationStream(response.body, onProgress);
  }

  return readUrlValidationResponse(response);
}

/** Parse the one-shot (non-streaming) validation response by status code. */
async function readUrlValidationResponse(
  response: Response,
): Promise<UrlValidationOutcome> {
  if (response.status === 404) {
    return { kind: 'not-found', details: await readHydraError(response) };
  }
  if (response.status === 406) {
    const details = await readHydraError(response);
    if (details?.title?.startsWith(COULD_NOT_FETCH_URL_PREFIX)) {
      return { kind: 'fetch-failed', details };
    }
    return { kind: 'no-dataset', details };
  }
  if (response.status === 200 || response.status === 400) {
    const json = await response.json();
    return { kind: 'report', report: parseShaclReport(json) };
  }
  return {
    kind: 'error',
    message: `Unexpected response ${response.status} from validation API`,
  };
}

/**
 * Read a Server-Sent Events stream of `progress` frames followed by a final
 * `report` (JSON-LD SHACL report) or `error` (no dataset found) frame.
 */
async function readValidationStream(
  body: ReadableStream<Uint8Array>,
  onProgress: (progress: ValidationProgress) => void,
): Promise<UrlValidationOutcome> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let outcome: UrlValidationOutcome | null = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary: number;
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const frameOutcome = handleSseFrame(frame, onProgress);
      if (frameOutcome) outcome = frameOutcome;
    }
  }

  return (
    outcome ?? {
      kind: 'error',
      message: 'Validation stream ended without a report',
    }
  );
}

/**
 * Handle one SSE frame. `progress` frames invoke {@link onProgress} and return
 * null; terminal frames return the outcome to resolve with.
 */
function handleSseFrame(
  frame: string,
  onProgress: (progress: ValidationProgress) => void,
): UrlValidationOutcome | null {
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of frame.split('\n')) {
    if (line.startsWith('event: ')) event = line.slice('event: '.length);
    else if (line.startsWith('data: '))
      dataLines.push(line.slice('data: '.length));
  }
  const data = dataLines.join('\n');
  if (data === '') return null;

  if (event === 'progress') {
    onProgress(JSON.parse(data) as ValidationProgress);
    return null;
  }
  if (event === 'report') {
    return { kind: 'report', report: parseShaclReport(JSON.parse(data)) };
  }
  if (event === 'error') {
    const payload = JSON.parse(data) as { statusCode?: number };
    const details = toHydraError(payload);
    if (details?.title?.startsWith(COULD_NOT_FETCH_URL_PREFIX)) {
      return { kind: 'fetch-failed', details };
    }
    // 406 is the no-dataset case; any other status (e.g. 500 when validation
    // threw mid-stream) is a generic error rather than a missing dataset.
    if (payload.statusCode === 406) {
      return { kind: 'no-dataset', details };
    }
    return { kind: 'error', message: details?.title ?? 'Validation failed' };
  }
  return null;
}

export async function validateInline(
  body: string,
  contentType: string,
  signal?: AbortSignal,
): Promise<InlineValidationOutcome> {
  const response = await fetch(`${PUBLIC_API_ENDPOINT}/datasets/validate`, {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      Accept: 'application/ld+json',
    },
    body,
    signal,
  });

  if (response.status === 406) {
    return { kind: 'no-dataset', details: await readHydraError(response) };
  }
  if (response.status === 200 || response.status === 400) {
    const json = await response.json();
    if (isShaclReport(json)) {
      return { kind: 'report', report: parseShaclReport(json) };
    }
    const hydra = toHydraError(json);
    if (hydra?.title) {
      return { kind: 'no-dataset', details: hydra };
    }
    const message = extractErrorMessage(json) ?? response.statusText;
    return { kind: 'parse-error', message };
  }

  return {
    kind: 'error',
    message: `Unexpected response ${response.status} from validation API`,
  };
}

export async function checkDomainAllowed(
  url: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const params = new URLSearchParams({ url });
  const response = await fetch(
    `${PUBLIC_API_ENDPOINT}/allowed-domains?${params.toString()}`,
    { method: 'GET', signal },
  );
  if (response.status === 200) return true;
  if (response.status === 404) return false;
  throw new Error(`Unexpected response ${response.status} from allow-list API`);
}

/**
 * Detect whether a JSON response is a SHACL report (array of nodes with typed
 * ValidationReport or ValidationResult). Plain error bodies from the API are
 * objects like `{ statusCode: 400, message: '…' }`.
 */
function isShaclReport(json: unknown): boolean {
  if (!Array.isArray(json)) return false;
  return json.some((node) => {
    if (!node || typeof node !== 'object') return false;
    const types = (node as { '@type'?: string[] })['@type'];
    return Array.isArray(types) && types.some((t) => t.includes('shacl#'));
  });
}

function extractErrorMessage(json: unknown): string | undefined {
  if (json && typeof json === 'object' && 'message' in json) {
    const message = (json as { message: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return undefined;
}

async function readHydraError(
  response: Response,
): Promise<ApiErrorDetails | undefined> {
  try {
    return toHydraError(await response.json());
  } catch {
    return undefined;
  }
}

function toHydraError(json: unknown): ApiErrorDetails | undefined {
  if (!json || typeof json !== 'object') return undefined;
  const record = json as Record<string, unknown>;
  const title = typeof record.title === 'string' ? record.title : undefined;
  const description =
    typeof record.description === 'string' ? record.description : undefined;
  if (!title && !description) return undefined;
  return { title, description };
}
