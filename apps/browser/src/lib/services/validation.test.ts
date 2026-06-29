import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchErrorReason,
  validateByUrl,
  type ValidationProgress,
} from './validation.js';

/** Build a streaming SSE Response from raw event frames. */
function sseResponse(frames: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

describe('validateByUrl streaming', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reports progress then resolves to the report when the server streams', async () => {
    const report = [
      {
        '@id': '_:b0',
        '@type': ['http://www.w3.org/ns/shacl#ValidationReport'],
        'http://www.w3.org/ns/shacl#conforms': [{ '@value': true }],
      },
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        sseResponse([
          'event: progress\ndata: {"completed":0,"total":2}\n\n',
          'event: progress\ndata: {"completed":1,"total":2}\n\n',
          'event: progress\ndata: {"completed":2,"total":2}\n\n',
          `event: report\ndata: ${JSON.stringify(report)}\n\n`,
        ]),
      );
    vi.stubGlobal('fetch', fetchMock);

    const progress: ValidationProgress[] = [];
    const outcome = await validateByUrl(
      'https://example.com/dataset',
      undefined,
      (update) => progress.push(update),
    );

    expect(progress).toEqual([
      { completed: 0, total: 2 },
      { completed: 1, total: 2 },
      { completed: 2, total: 2 },
    ]);
    expect(outcome.kind).toBe('report');
    expect(fetchMock.mock.calls[0][1].headers.Accept).toBe('text/event-stream');
  });

  it('falls back to the one-shot response when the server does not stream', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ title: 'No dataset found at URL …' }), {
        status: 406,
        headers: { 'Content-Type': 'application/ld+json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const progress: ValidationProgress[] = [];
    const outcome = await validateByUrl(
      'https://example.com/dataset',
      undefined,
      (update) => progress.push(update),
    );

    expect(progress).toEqual([]);
    expect(outcome.kind).toBe('no-dataset');
  });

  it('maps a non-406 SSE error frame to a generic error outcome', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        sseResponse([
          'event: progress\ndata: {"completed":0,"total":1}\n\n',
          `event: error\ndata: ${JSON.stringify({ statusCode: 500, title: 'Validation failed' })}\n\n`,
        ]),
      );
    vi.stubGlobal('fetch', fetchMock);

    const progress: ValidationProgress[] = [];
    const outcome = await validateByUrl(
      'https://example.com/dataset',
      undefined,
      (update) => progress.push(update),
    );

    expect(progress).toEqual([{ completed: 0, total: 1 }]);
    expect(outcome).toEqual({ kind: 'error', message: 'Validation failed' });
  });

  it('maps a 406 SSE error frame to a no-dataset outcome', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        sseResponse([
          `event: error\ndata: ${JSON.stringify({ statusCode: 406, title: 'No dataset found at URL …' })}\n\n`,
        ]),
      );
    vi.stubGlobal('fetch', fetchMock);

    const progress: ValidationProgress[] = [];
    const outcome = await validateByUrl(
      'https://example.com/dataset',
      undefined,
      (update) => progress.push(update),
    );

    expect(outcome.kind).toBe('no-dataset');
  });
});

describe('fetchErrorReason', () => {
  it('extracts the reason from a CouldNotFetchUrl title', () => {
    expect(
      fetchErrorReason(
        'Could not fetch URL https://example.com/loop: redirect count exceeded',
      ),
    ).toBe('redirect count exceeded');
  });

  it('handles URLs containing colons (e.g. ports)', () => {
    expect(
      fetchErrorReason(
        'Could not fetch URL https://example.com:8080/x: redirect count exceeded',
      ),
    ).toBe('redirect count exceeded');
  });

  it('returns undefined for unrelated titles', () => {
    expect(
      fetchErrorReason('No dataset found at URL https://example.com'),
    ).toBeUndefined();
  });

  it('returns undefined when no title is given', () => {
    expect(fetchErrorReason(undefined)).toBeUndefined();
  });
});
