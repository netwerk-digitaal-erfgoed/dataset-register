import { PUBLIC_API_ENDPOINT } from '$env/static/public';
import { parseShaclReport, type ShaclReport } from './shacl-report.js';

export interface ApiErrorDetails {
  title?: string;
  description?: string;
}

export type UrlValidationOutcome =
  | { kind: 'report'; report: ShaclReport }
  | { kind: 'not-found'; details?: ApiErrorDetails }
  | { kind: 'no-dataset'; details?: ApiErrorDetails }
  | { kind: 'error'; message: string };

export type InlineValidationOutcome =
  | { kind: 'report'; report: ShaclReport }
  | { kind: 'parse-error'; message: string }
  | { kind: 'no-dataset'; details?: ApiErrorDetails }
  | { kind: 'error'; message: string };

export async function validateByUrl(
  url: string,
  signal?: AbortSignal,
): Promise<UrlValidationOutcome> {
  const response = await fetch(`${PUBLIC_API_ENDPOINT}/datasets/validate`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/ld+json',
      Accept: 'application/ld+json',
    },
    body: JSON.stringify({ '@id': url }),
    signal,
  });

  if (response.status === 404) {
    return { kind: 'not-found', details: await readHydraError(response) };
  }
  if (response.status === 406) {
    return { kind: 'no-dataset', details: await readHydraError(response) };
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
