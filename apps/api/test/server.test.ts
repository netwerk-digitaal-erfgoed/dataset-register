import nock from 'nock';
import type { Mock } from 'vitest';
import { FastifyInstance } from 'fastify';
import { Server } from 'http';
import { server } from '../src/server.js';
import {
  readUrl,
  ShaclEngineValidator,
  type InvalidDataset,
  type Valid,
  type Validator,
} from '@dataset-register/core';
import {
  file,
  MockAllowedRegistrationDomainStore,
  MockDatasetStore,
  MockRatingStore,
  MockRegistrationStore,
} from '@dataset-register/core/test-utils';
import { Registration } from '@dataset-register/core';
import { fileURLToPath, URL } from 'url';
import { dirname } from 'path';

let httpServer: FastifyInstance<Server>;
const registrationStore = new MockRegistrationStore();

/**
 * Parse a Server-Sent Events stream body into its individual events. This is
 * an intentionally independent parser (the browser client has its own in
 * validation.ts) so the test validates the server's wire format on its own
 * terms rather than through the client's parsing assumptions.
 */
function parseSse(body: string): { event: string; data: string }[] {
  return body
    .split('\n\n')
    .filter((block) => block.trim() !== '')
    .map((block) => {
      const event = /^event: (.*)$/m.exec(block)?.[1] ?? 'message';
      const data = block
        .split('\n')
        .filter((line) => line.startsWith('data: '))
        .map((line) => line.slice('data: '.length))
        .join('\n');
      return { event, data };
    });
}

describe('Server', () => {
  beforeAll(async () => {
    const shacl = await readUrl('../../requirements/shacl.ttl');
    httpServer = await server(
      new MockDatasetStore(),
      registrationStore,
      new MockAllowedRegistrationDomainStore(),
      new ShaclEngineValidator(shacl),
      shacl,
      '/',
      { logger: true },
    );

    nock.back.fixtures = dirname(fileURLToPath(import.meta.url)) + '/http';
    nock.back.setMode('record');
  });

  afterAll(() => {
    nock.restore();
  });

  it('shows documentation as HTML', async () => {
    const response = await httpServer.inject({
      method: 'GET',
      url: '/',
      headers: { Accept: '*/*' },
    });
    expect(response.statusCode).toEqual(200);
    expect(response.headers['content-type']).toEqual(
      'text/html; charset=utf-8',
    );
  });

  it('shows documentation as JSON', async () => {
    const response = await httpServer.inject({
      method: 'GET',
      url: '/json',
      headers: { Accept: '*/*' },
    });
    expect(response.statusCode).toEqual(200);
  });

  it('rejects validation requests without URL', async () => {
    const response = await httpServer.inject({
      method: 'PUT',
      url: '/datasets/validate',
    });
    expect(response.statusCode).toEqual(400);
  });

  it('handles malformed JSON in request body', async () => {
    const response = await httpServer.inject({
      method: 'PUT',
      url: '/datasets/validate',
      headers: { 'Content-Type': 'application/ld+json' },
      payload: 'not valid json {',
    });
    expect(response.statusCode).toEqual(400);
  });

  it('rejects validation requests that point to 404 URL', async () => {
    nock('https://example.com/').get('/404').reply(404);
    const response = await httpServer.inject({
      method: 'PUT',
      url: '/datasets/validate',
      headers: { 'Content-Type': 'application/ld+json' },
      payload: JSON.stringify({
        '@id': 'https://example.com/404',
      }),
    });
    expect(response.statusCode).toEqual(404);
  });

  it('rejects validation requests that point to URL with empty response and no well-known datacatalog', async () => {
    nock('https://example.com/')
      .get('/200')
      .reply(200, '', { 'Content-Type': 'text/turtle' });
    nock('https://example.com').get('/.well-known/datacatalog').reply(404);
    const response = await httpServer.inject({
      method: 'PUT',
      url: '/datasets/validate',
      headers: { 'Content-Type': 'application/ld+json' },
      payload: JSON.stringify({
        '@id': 'https://example.com/200',
      }),
    });
    expect(response.statusCode).toEqual(406);
    expect(response.payload).toEqual(
      '{"@context":"http://www.w3.org/ns/hydra/core#","@type":"Error","title":"No dataset found at URL https://example.com/200","description":"The provided URL does not contain either a schema:Dataset or a dcat:Dataset. Please ensure your submitted URL includes at least one dataset description."}',
    );
    expect(response.json()['title']).toEqual(
      'No dataset found at URL https://example.com/200',
    );
    expect(response.json()['description']).toContain(
      'The provided URL does not contain either a schema:Dataset or a dcat:Dataset.',
    );
  });

  it('discovers datasets via well-known datacatalog when URL has no dataset', async () => {
    nock('https://example.com/')
      .get('/no-dataset')
      .reply(200, '', { 'Content-Type': 'text/turtle' });
    const catalogContent = await file('dataset-dcat-valid-minimal.jsonld');
    nock('https://example.com')
      .defaultReplyHeaders({ 'Content-Type': 'application/ld+json' })
      .get('/.well-known/datacatalog')
      .reply(200, catalogContent);
    const response = await httpServer.inject({
      method: 'PUT',
      url: '/datasets/validate',
      headers: { 'Content-Type': 'application/ld+json' },
      payload: JSON.stringify({
        '@id': 'https://example.com/no-dataset',
      }),
    });
    expect(response.statusCode).toEqual(200);
  });

  it('surfaces the fetch reason when the URL cannot be fetched (e.g. redirect loop)', async () => {
    const wrapped = new TypeError('fetch failed', {
      cause: new Error('redirect count exceeded'),
    });
    nock('https://example.com/').get('/loop').replyWithError(wrapped);
    const response = await httpServer.inject({
      method: 'PUT',
      url: '/datasets/validate',
      headers: { 'Content-Type': 'application/ld+json' },
      payload: JSON.stringify({
        '@id': 'https://example.com/loop',
      }),
    });
    expect(response.statusCode).toEqual(406);
    expect(response.json()['title']).toContain(
      'Could not fetch URL https://example.com/loop',
    );
    expect(response.json()['description']).toContain('redirect count exceeded');
  });

  it('rejects validation requests that point to URL with invalid Content-Type', async () => {
    nock('https://example.com/')
      .get('/invalid-content-type')
      .reply(200, '', { 'Content-Type': 'nope' });
    const response = await httpServer.inject({
      method: 'PUT',
      url: '/datasets/validate',
      headers: { 'Content-Type': 'application/ld+json' },
      payload: JSON.stringify({
        '@id': 'https://example.com/invalid-content-type',
      }),
    });
    expect(response.statusCode).toEqual(406);
    expect(response.json()['title']).toEqual(
      'Invalid Content-Type at https://example.com/invalid-content-type',
    );
    expect(response.json()['description']).toContain(
      'URL returned an unrecognized or invalid Content-Type header: nope.',
    );
  });

  it('responds with 200 to valid dataset requests', async () => {
    const { nockDone } = await nock.back('valid-dataset.json');
    const response = await httpServer.inject({
      method: 'PUT',
      url: '/datasets/validate',
      headers: { 'Content-Type': 'application/ld+json' },
      payload: JSON.stringify({
        '@id': 'https://demo.netwerkdigitaalerfgoed.nl/datasets/kb/2.html',
      }),
    });
    nockDone();
    expect(response.statusCode).toEqual(200);
    expect(response.headers['content-type']).toEqual(
      'application/ld+json; charset=utf-8',
    );
    console.log(response.body);
    expect(response.payload).not.toEqual('');
  });

  it('streams progress events then a report when the client accepts text/event-stream', async () => {
    const shacl = await readUrl('../../requirements/shacl.ttl');
    const progressingValidator: Validator = {
      async validate(_input, onProgress) {
        onProgress?.(0, 2);
        onProgress?.(1, 2);
        onProgress?.(2, 2);
        // `readUrl` yields a DatasetCore; cast to the report's richer Dataset
        // type — the streaming path only iterates its quads.
        return { state: 'valid', errors: shacl } as Valid;
      },
    };
    const streamingServer = await server(
      new MockDatasetStore(),
      registrationStore,
      new MockAllowedRegistrationDomainStore(),
      progressingValidator,
      shacl,
      '/',
      { logger: false },
    );
    nock('https://example.com/')
      .get('/streamed')
      .reply(200, '<https://example.com/s> <https://example.com/p> "o" .', {
        'Content-Type': 'text/turtle',
      });

    const response = await streamingServer.inject({
      method: 'PUT',
      url: '/datasets/validate',
      headers: {
        'Content-Type': 'application/ld+json',
        Accept: 'text/event-stream',
      },
      payload: JSON.stringify({ '@id': 'https://example.com/streamed' }),
    });

    expect(response.statusCode).toEqual(200);
    expect(response.headers['content-type']).toContain('text/event-stream');

    const events = parseSse(response.payload);
    const progress = events.filter((event) => event.event === 'progress');
    expect(progress.map((event) => JSON.parse(event.data))).toEqual([
      { completed: 0, total: 2 },
      { completed: 1, total: 2 },
      { completed: 2, total: 2 },
    ]);

    const report = events.find((event) => event.event === 'report');
    expect(report).toBeDefined();
    expect(Array.isArray(JSON.parse(report?.data ?? ''))).toBe(true);
  });

  it('streams an error event when no dataset is found and the client accepts text/event-stream', async () => {
    const shacl = await readUrl('../../requirements/shacl.ttl');
    const noDatasetValidator: Validator = {
      async validate() {
        return { state: 'no-dataset' };
      },
    };
    const streamingServer = await server(
      new MockDatasetStore(),
      registrationStore,
      new MockAllowedRegistrationDomainStore(),
      noDatasetValidator,
      shacl,
      '/',
      { logger: false },
    );
    nock('https://example.com/')
      .get('/empty')
      .reply(200, '<https://example.com/s> <https://example.com/p> "o" .', {
        'Content-Type': 'text/turtle',
      });

    const response = await streamingServer.inject({
      method: 'PUT',
      url: '/datasets/validate',
      headers: {
        'Content-Type': 'application/ld+json',
        Accept: 'text/event-stream',
      },
      payload: JSON.stringify({ '@id': 'https://example.com/empty' }),
    });

    expect(response.headers['content-type']).toContain('text/event-stream');
    const error = parseSse(response.payload).find(
      (event) => event.event === 'error',
    );
    expect(error).toBeDefined();
    expect(JSON.parse(error?.data ?? '{}').title).toEqual(
      'No dataset found at URL https://example.com/empty',
    );
  });

  it('ends the stream cleanly when validation throws mid-stream', async () => {
    const shacl = await readUrl('../../requirements/shacl.ttl');
    const failingValidator: Validator = {
      async validate(_input, onProgress) {
        onProgress?.(0, 1);
        throw new Error('probe exploded');
      },
    };
    const streamingServer = await server(
      new MockDatasetStore(),
      registrationStore,
      new MockAllowedRegistrationDomainStore(),
      failingValidator,
      shacl,
      '/',
      { logger: false },
    );
    nock('https://example.com/')
      .get('/boom')
      .reply(200, '<https://example.com/s> <https://example.com/p> "o" .', {
        'Content-Type': 'text/turtle',
      });

    const response = await streamingServer.inject({
      method: 'PUT',
      url: '/datasets/validate',
      headers: {
        'Content-Type': 'application/ld+json',
        Accept: 'text/event-stream',
      },
      payload: JSON.stringify({ '@id': 'https://example.com/boom' }),
    });

    // The partial progress was delivered, then an error frame surfaces the
    // failure (instead of a silent close), and no report frame is sent.
    const events = parseSse(response.payload);
    expect(events.some((event) => event.event === 'progress')).toBe(true);
    expect(events.some((event) => event.event === 'report')).toBe(false);
    const error = events.find((event) => event.event === 'error');
    expect(error).toBeDefined();
    expect(JSON.parse(error?.data ?? '{}').statusCode).toEqual(500);
  });

  it('streams a report (not a 4xx) for an invalid dataset over text/event-stream', async () => {
    const shacl = await readUrl('../../requirements/shacl.ttl');
    const invalidValidator: Validator = {
      async validate(_input, onProgress) {
        onProgress?.(0, 1);
        // `readUrl` yields a DatasetCore; the streaming path only iterates it.
        return { state: 'invalid', errors: shacl } as InvalidDataset;
      },
    };
    const streamingServer = await server(
      new MockDatasetStore(),
      registrationStore,
      new MockAllowedRegistrationDomainStore(),
      invalidValidator,
      shacl,
      '/',
      { logger: false },
    );
    nock('https://example.com/')
      .get('/invalid')
      .reply(200, '<https://example.com/s> <https://example.com/p> "o" .', {
        'Content-Type': 'text/turtle',
      });

    const response = await streamingServer.inject({
      method: 'PUT',
      url: '/datasets/validate',
      headers: {
        'Content-Type': 'application/ld+json',
        Accept: 'text/event-stream',
      },
      payload: JSON.stringify({ '@id': 'https://example.com/invalid' }),
    });

    // Like the valid case, invalid datasets stream a report frame; the browser
    // reads sh:conforms to tell them apart.
    expect(response.headers['content-type']).toContain('text/event-stream');
    const report = parseSse(response.payload).find(
      (event) => event.event === 'report',
    );
    expect(report).toBeDefined();
    expect(Array.isArray(JSON.parse(report?.data ?? ''))).toBe(true);
  });

  it('returns a normal error response (not a stream) when an event-stream request cannot resolve the URL', async () => {
    nock('https://example.com/').get('/404-stream').reply(404);
    const response = await httpServer.inject({
      method: 'PUT',
      url: '/datasets/validate',
      headers: {
        'Content-Type': 'application/ld+json',
        Accept: 'text/event-stream',
      },
      payload: JSON.stringify({ '@id': 'https://example.com/404-stream' }),
    });
    // Resolution errors arrive as plain HTTP so the browser falls back to its
    // one-shot parser, exactly as for non-streaming requests.
    expect(response.statusCode).toEqual(404);
    expect(response.headers['content-type']).not.toContain('text/event-stream');
  });

  it('validates JSON-LD dataset description in request body', async () => {
    const response = await httpServer.inject({
      method: 'POST',
      url: '/datasets/validate',
      headers: { 'Content-Type': 'application/ld+json' },
      payload: await file('dataset-schema-org-invalid.jsonld'),
    });
    expect(response.statusCode).toEqual(400);
  });

  it('validates http://schema.org dataset description in request body', async () => {
    const response = await httpServer.inject({
      method: 'POST',
      url: '/datasets/validate',
      headers: { 'Content-Type': 'text/turtle' },
      payload: await file('dataset-http-schema-org-valid.ttl'),
    });
    expect(response.statusCode).toEqual(200);
  });

  it('validates Turtle dataset description in request body', async () => {
    const response = await httpServer.inject({
      method: 'POST',
      url: '/datasets/validate',
      headers: { 'Content-Type': 'text/turtle', Accept: 'text/turtle' },
      payload: await file('dataset-schema-org-valid.ttl'),
    });
    expect(response.statusCode).toEqual(200);
    expect(response.headers['content-type']).toEqual('text/turtle');
    expect(response.body).toContain(
      'a <http://www.w3.org/ns/shacl#ValidationReport>',
    );
  });

  it('handles invalid JSON-LD in request body', async () => {
    const response = await httpServer.inject({
      method: 'POST',
      url: '/datasets/validate',
      headers: { 'Content-Type': 'application/ld+json' },
      payload: 'This is not JSON-LD',
    });
    expect(response.statusCode).toEqual(400);
  });

  it('handles invalid Turtle in request body', async () => {
    const response = await httpServer.inject({
      method: 'POST',
      url: '/datasets/validate',
      headers: { 'Content-Type': 'text/turtle' },
      payload: 'This is not Turtle',
    });
    expect(response.statusCode).toEqual(400);
  });

  it('responds with validation errors to invalid dataset requests', async () => {
    const { nockDone } = await nock.back('invalid-dataset.json');
    const response = await httpServer.inject({
      method: 'PUT',
      url: '/datasets/validate',
      headers: { 'Content-Type': 'application/ld+json', Accept: 'text/turtle' },
      payload: JSON.stringify({
        '@id': 'https://demo.netwerkdigitaalerfgoed.nl/datasets/kb/2a.html',
      }),
    });
    nockDone();
    expect(response.statusCode).toEqual(400);
    expect(response.headers['content-type']).toEqual('text/turtle');
    expect(response.payload).not.toEqual('');
  });

  it('ignores UTF-8 BOMs', async () => {
    const { nockDone } = await nock.back('utf8-bom.json');
    const response = await httpServer.inject({
      method: 'PUT',
      url: '/datasets/validate',
      headers: { 'Content-Type': 'application/ld+json' },
      payload: JSON.stringify({
        '@id':
          'https://littest.hosting.deventit.net/Atlantispubliek/data/set/catalog.ttl',
      }),
    });
    nockDone();
    expect(response.statusCode).toEqual(200);
  });

  it('handles errors during streaming', async () => {
    nock('https://example.com')
      .get('/200')
      // {"@id": null} is an example to trip up JsonLdParser, which throws Found illegal @id 'null'.
      .reply(200, { '@id': null }, { 'Content-Type': 'application/ld+json' });
    const response = await httpServer.inject({
      method: 'PUT',
      url: '/datasets/validate',
      headers: { 'Content-Type': 'application/ld+json' },
      payload: JSON.stringify({
        '@id': 'https://example.com/200',
      }),
    });
    expect(response.statusCode).toEqual(406);
  });

  it('rejects unauthorized domains', async () => {
    const response = await httpServer.inject({
      method: 'POST',
      url: '/datasets',
      headers: { 'Content-Type': 'application/ld+json' },
      payload: JSON.stringify({
        '@id': 'https://subdomain.not-allowed.com/dataset',
      }),
    });
    expect(response.statusCode).toEqual(403);
  });

  it('accepts authorized domains', async () => {
    const { nockDone } = await nock.back('post-dataset.json');
    const response = await httpServer.inject({
      method: 'POST',
      url: '/datasets',
      headers: { 'Content-Type': 'application/ld+json' },
      payload: JSON.stringify({
        '@id': 'https://demo.netwerkdigitaalerfgoed.nl/datasets/kb/2.html',
      }),
    });
    nockDone();
    expect(response.statusCode).toEqual(202);
    expect(response.payload).not.toEqual('');
  });

  it('discovers and registers datasets via well-known datacatalog', async () => {
    // The original URL has no dataset.
    nock('https://demo.netwerkdigitaalerfgoed.nl')
      .get('/no-dataset')
      .reply(200, '', { 'Content-Type': 'text/turtle' });
    // The well-known datacatalog URL has a valid dataset.
    const catalogContent = await file('dataset-dcat-valid-minimal.jsonld');
    nock('https://demo.netwerkdigitaalerfgoed.nl')
      .defaultReplyHeaders({ 'Content-Type': 'application/ld+json' })
      .get('/.well-known/datacatalog')
      .reply(200, catalogContent);
    const response = await httpServer.inject({
      method: 'POST',
      url: '/datasets',
      headers: { 'Content-Type': 'application/ld+json' },
      payload: JSON.stringify({
        '@id': 'https://demo.netwerkdigitaalerfgoed.nl/no-dataset',
      }),
    });
    expect(response.statusCode).toEqual(202);
  });

  it('returns 200 for a URL on an allowed domain', async () => {
    const response = await httpServer.inject({
      method: 'GET',
      url: '/allowed-domains?url=https://netwerkdigitaalerfgoed.nl/dataset',
    });
    expect(response.statusCode).toEqual(200);
  });

  it('returns 200 for a URL on a subdomain of an allowed domain', async () => {
    const response = await httpServer.inject({
      method: 'GET',
      url: '/allowed-domains?url=https://sub.netwerkdigitaalerfgoed.nl/dataset',
    });
    expect(response.statusCode).toEqual(200);
  });

  it('returns 404 for a URL on a disallowed domain', async () => {
    const response = await httpServer.inject({
      method: 'GET',
      url: '/allowed-domains?url=https://not-allowed.com/dataset',
    });
    expect(response.statusCode).toEqual(404);
  });

  it('returns 400 when url parameter is missing', async () => {
    const response = await httpServer.inject({
      method: 'GET',
      url: '/allowed-domains',
    });
    expect(response.statusCode).toEqual(400);
  });

  it('returns 400 for an invalid url parameter', async () => {
    const response = await httpServer.inject({
      method: 'GET',
      url: '/allowed-domains?url=not-a-url',
    });
    expect(response.statusCode).toEqual(400);
  });

  it('responds with validation errors when adding an invalid dataset', async () => {
    const { nockDone } = await nock.back('invalid-dataset.json');
    const response = await httpServer.inject({
      method: 'POST',
      url: '/datasets',
      headers: { 'Content-Type': 'application/ld+json', Accept: 'text/turtle' },
      payload: JSON.stringify({
        '@id': 'https://demo.netwerkdigitaalerfgoed.nl/datasets/kb/2a.html',
      }),
    });
    nockDone();
    expect(response.statusCode).toEqual(400);
    expect(response.payload).not.toEqual('');
  });

  it('stores registration even if fetching datasets fails', async () => {
    const { nockDone } = await nock.back('post-dataset-query-fails.json');
    const response = await httpServer.inject({
      method: 'POST',
      url: '/datasets',
      headers: { 'Content-Type': 'application/ld+json' },
      payload: JSON.stringify({
        '@id': 'https://netwerkdigitaalerfgoed.nl/fails',
      }),
    });
    nockDone();
    // sleep 2 seconds to allow the async store to complete
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Validation succeeds, so 202 to the client, even if fetching datasets fails.
    expect(response.statusCode).toEqual(202);
    expect(
      registrationStore.isRegistered(
        new URL('https://netwerkdigitaalerfgoed.nl/fails'),
      ),
    ).toBe(true);
  });

  it('returns SHACL graph', async () => {
    const response = await httpServer.inject({
      method: 'GET',
      url: '/shacl',
    });
    expect(response.statusCode).toEqual(200);
    expect(response.payload).not.toEqual('');
    expect(response.json().length).toBeGreaterThan(100);
  });
});

describe('POST /allowed-domains', () => {
  let httpServerWithAuth: FastifyInstance<Server>;
  let allowedDomainStore: MockAllowedRegistrationDomainStore;
  const testToken = 'test-api-token';

  beforeAll(async () => {
    const shacl = await readUrl('../../requirements/shacl.ttl');
    allowedDomainStore = new MockAllowedRegistrationDomainStore();
    httpServerWithAuth = await server(
      new MockDatasetStore(),
      new MockRegistrationStore(),
      allowedDomainStore,
      new ShaclEngineValidator(shacl),
      shacl,
      '/',
      { logger: false },
      new MockRatingStore(),
      testToken,
    );
  });

  it('returns 401 without Authorization header', async () => {
    const response = await httpServerWithAuth.inject({
      method: 'POST',
      url: '/allowed-domains',
      headers: { 'Content-Type': 'application/json', Accept: '*/*' },
      payload: JSON.stringify({ domain: 'example.com' }),
    });
    expect(response.statusCode).toEqual(401);
  });

  it('returns 401 with invalid token', async () => {
    const response = await httpServerWithAuth.inject({
      method: 'POST',
      url: '/allowed-domains',
      headers: {
        Authorization: 'Bearer invalid-token',
        'Content-Type': 'application/json',
        Accept: '*/*',
      },
      payload: JSON.stringify({ domain: 'example.com' }),
    });
    expect(response.statusCode).toEqual(401);
  });

  it('returns 400 without domain in body', async () => {
    const response = await httpServerWithAuth.inject({
      method: 'POST',
      url: '/allowed-domains',
      headers: {
        Authorization: `Bearer ${testToken}`,
        'Content-Type': 'application/json',
        Accept: '*/*',
      },
      payload: JSON.stringify({}),
    });
    expect(response.statusCode).toEqual(400);
  });

  it('returns 400 for an invalid domain', async () => {
    const response = await httpServerWithAuth.inject({
      method: 'POST',
      url: '/allowed-domains',
      headers: {
        Authorization: `Bearer ${testToken}`,
        'Content-Type': 'application/json',
        Accept: '*/*',
      },
      payload: JSON.stringify({ domain: 'not a domain' }),
    });
    expect(response.statusCode).toEqual(400);
  });

  it('adds a subdomain when its registrable parent is not on the list', async () => {
    expect(await allowedDomainStore.contains('sub.subdomain-only.com')).toBe(
      false,
    );
    expect(await allowedDomainStore.contains('subdomain-only.com')).toBe(false);

    const response = await httpServerWithAuth.inject({
      method: 'POST',
      url: '/allowed-domains',
      headers: {
        Authorization: `Bearer ${testToken}`,
        'Content-Type': 'application/json',
        Accept: '*/*',
      },
      payload: JSON.stringify({ domain: 'sub.subdomain-only.com' }),
    });

    expect(response.statusCode).toEqual(204);
    expect(await allowedDomainStore.contains('sub.subdomain-only.com')).toBe(
      true,
    );
    // The registrable parent must not have been added.
    expect(await allowedDomainStore.contains('subdomain-only.com')).toBe(false);
  });

  it('is a no-op for a subdomain whose registrable parent is already allowed', async () => {
    await allowedDomainStore.add('parent-allowed.com');

    const response = await httpServerWithAuth.inject({
      method: 'POST',
      url: '/allowed-domains',
      headers: {
        Authorization: `Bearer ${testToken}`,
        'Content-Type': 'application/json',
        Accept: '*/*',
      },
      payload: JSON.stringify({ domain: 'sub.parent-allowed.com' }),
    });

    expect(response.statusCode).toEqual(204);
    // The subdomain must not have been stored, since the parent already covers it.
    expect(await allowedDomainStore.contains('sub.parent-allowed.com')).toBe(
      false,
    );
  });

  it('returns 204 and adds a registrable domain', async () => {
    expect(await allowedDomainStore.contains('newly-allowed.com')).toBe(false);

    const response = await httpServerWithAuth.inject({
      method: 'POST',
      url: '/allowed-domains',
      headers: {
        Authorization: `Bearer ${testToken}`,
        'Content-Type': 'application/json',
        Accept: '*/*',
      },
      payload: JSON.stringify({ domain: 'newly-allowed.com' }),
    });

    expect(response.statusCode).toEqual(204);
    expect(await allowedDomainStore.contains('newly-allowed.com')).toBe(true);
  });

  it('returns 204 when adding a domain that is already allowed', async () => {
    await allowedDomainStore.add('already-allowed.com');

    const response = await httpServerWithAuth.inject({
      method: 'POST',
      url: '/allowed-domains',
      headers: {
        Authorization: `Bearer ${testToken}`,
        'Content-Type': 'application/json',
        Accept: '*/*',
      },
      payload: JSON.stringify({ domain: 'already-allowed.com' }),
    });

    expect(response.statusCode).toEqual(204);
    expect(await allowedDomainStore.contains('already-allowed.com')).toBe(true);
  });
});

describe('DELETE /datasets', () => {
  let httpServerWithAuth: FastifyInstance<Server>;
  let deleteRegistrationStore: MockRegistrationStore;
  const testToken = 'test-api-token';

  beforeAll(async () => {
    const shacl = await readUrl('../../requirements/shacl.ttl');
    deleteRegistrationStore = new MockRegistrationStore();
    httpServerWithAuth = await server(
      new MockDatasetStore(),
      deleteRegistrationStore,
      new MockAllowedRegistrationDomainStore(),
      new ShaclEngineValidator(shacl),
      shacl,
      '/',
      { logger: false },
      new MockRatingStore(),
      testToken,
    );
  });

  beforeEach(async () => {
    // Clear any existing registrations and add a test registration before each test
    const testUrl = new URL(
      'https://demo.netwerkdigitaalerfgoed.nl/datasets/kb/2.html',
    );
    // First delete if exists
    await deleteRegistrationStore.delete(testUrl);
    // Then add fresh registration with linked datasets to cover the delete loop
    const registration = new Registration(testUrl, new Date()).read(
      [new URL('https://example.com/dataset1')],
      200,
      true,
    );
    await deleteRegistrationStore.store(registration);
  });

  it('returns 401 without Authorization header', async () => {
    const response = await httpServerWithAuth.inject({
      method: 'DELETE',
      url: '/datasets?url=https://demo.netwerkdigitaalerfgoed.nl/datasets/kb/2.html',
      headers: { Accept: '*/*' },
    });
    expect(response.statusCode).toEqual(401);
  });

  it('returns 401 with invalid token', async () => {
    const response = await httpServerWithAuth.inject({
      method: 'DELETE',
      url: '/datasets?url=https://demo.netwerkdigitaalerfgoed.nl/datasets/kb/2.html',
      headers: { Authorization: 'Bearer invalid-token', Accept: '*/*' },
    });
    expect(response.statusCode).toEqual(401);
  });

  it('returns 400 without url parameter', async () => {
    const response = await httpServerWithAuth.inject({
      method: 'DELETE',
      url: '/datasets',
      headers: { Authorization: `Bearer ${testToken}`, Accept: '*/*' },
    });
    expect(response.statusCode).toEqual(400);
  });

  it('returns 400 with invalid url parameter', async () => {
    const response = await httpServerWithAuth.inject({
      method: 'DELETE',
      url: '/datasets?url=not-a-valid-url',
      headers: { Authorization: `Bearer ${testToken}`, Accept: '*/*' },
    });
    expect(response.statusCode).toEqual(400);
  });

  it('returns 404 for non-existent registration', async () => {
    const response = await httpServerWithAuth.inject({
      method: 'DELETE',
      url: '/datasets?url=https://example.com/nonexistent',
      headers: { Authorization: `Bearer ${testToken}`, Accept: '*/*' },
    });
    expect(response.statusCode).toEqual(404);
  });

  it('returns 204 and deletes existing registration', async () => {
    const testUrl = new URL(
      'https://demo.netwerkdigitaalerfgoed.nl/datasets/kb/2.html',
    );

    // Verify registration exists before deletion
    expect(deleteRegistrationStore.isRegistered(testUrl)).toBe(true);

    const response = await httpServerWithAuth.inject({
      method: 'DELETE',
      url: `/datasets?url=${testUrl.toString()}`,
      headers: { Authorization: `Bearer ${testToken}`, Accept: '*/*' },
    });

    expect(response.statusCode).toEqual(204);

    // Verify registration was deleted
    expect(deleteRegistrationStore.isRegistered(testUrl)).toBe(false);
  });
});

describe('DELETE /datasets reindex trigger', () => {
  let httpServerWithAuth: FastifyInstance<Server>;
  let triggerStore: MockRegistrationStore;
  let onDatasetsChanged: Mock<() => void>;
  const testToken = 'test-api-token';
  const testUrl = new URL(
    'https://demo.netwerkdigitaalerfgoed.nl/datasets/kb/2.html',
  );

  beforeAll(async () => {
    const shacl = await readUrl('../../requirements/shacl.ttl');
    triggerStore = new MockRegistrationStore();
    onDatasetsChanged = vi.fn<() => void>();
    httpServerWithAuth = await server(
      new MockDatasetStore(),
      triggerStore,
      new MockAllowedRegistrationDomainStore(),
      new ShaclEngineValidator(shacl),
      shacl,
      '/',
      { logger: false },
      new MockRatingStore(),
      testToken,
      onDatasetsChanged,
    );
  });

  beforeEach(async () => {
    onDatasetsChanged.mockClear();
    await triggerStore.delete(testUrl);
    const registration = new Registration(testUrl, new Date()).read(
      [new URL('https://example.com/dataset1')],
      200,
      true,
    );
    await triggerStore.store(registration);
  });

  it('fires the reindex trigger after deleting a registration', async () => {
    const response = await httpServerWithAuth.inject({
      method: 'DELETE',
      url: `/datasets?url=${testUrl.toString()}`,
      headers: { Authorization: `Bearer ${testToken}`, Accept: '*/*' },
    });

    expect(response.statusCode).toEqual(204);
    expect(onDatasetsChanged).toHaveBeenCalledTimes(1);
  });

  it('does not fire the reindex trigger when nothing was deleted', async () => {
    const response = await httpServerWithAuth.inject({
      method: 'DELETE',
      url: '/datasets?url=https://example.com/nonexistent',
      headers: { Authorization: `Bearer ${testToken}`, Accept: '*/*' },
    });

    expect(response.statusCode).toEqual(404);
    expect(onDatasetsChanged).not.toHaveBeenCalled();
  });
});
