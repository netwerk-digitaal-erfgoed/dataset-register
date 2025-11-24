import nock from 'nock';
import { FastifyInstance } from 'fastify';
import { Server } from 'http';
import { server } from '../src/server.js';
import { readUrl, ShaclEngineValidator } from '@dataset-register/core';
import {
  file,
  MockAllowedRegistrationDomainStore,
  MockDatasetStore,
  MockRegistrationStore,
} from '@dataset-register/core/test-utils';
import { fileURLToPath, URL } from 'url';
import { dirname } from 'path';

let httpServer: FastifyInstance<Server>;
const registrationStore = new MockRegistrationStore();
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

  it('rejects validation requests that point to URL with empty response', async () => {
    nock('https://example.com/')
      .get('/200')
      .reply(200, '', { 'Content-Type': 'text/turtle' });
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
      '{"@context":{"@vocab":"http://www.w3.org/ns/hydra/core#"},"@type":"Error","description":"The provided URL does not contain either a schema:Dataset or a dcat:Dataset. Please ensure your submitted URL includes at least one dataset description.","title":"No dataset found at URL https://example.com/200"}',
    );
    expect(response.json()['title']).toEqual(
      'No dataset found at URL https://example.com/200',
    );
    expect(response.json()['description']).toContain(
      'The provided URL does not contain either a schema:Dataset or a dcat:Dataset.',
    );
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
    expect(response.headers['content-type']).toEqual('application/ld+json');
    console.log(response.body);
    expect(response.payload).not.toEqual('');
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
