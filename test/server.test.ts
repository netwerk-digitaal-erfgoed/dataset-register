import nock from 'nock';
import {FastifyInstance} from 'fastify';
import {Server} from 'http';
import {server} from '../src/server';
import {readUrl, ShaclValidator} from '../src/validator';
import {
  file,
  MockAllowedRegistrationDomainStore,
  MockDatasetStore,
  MockRegistrationStore,
} from './mock';
import {fileURLToPath, URL} from 'url';
import {dirname} from 'path';

let httpServer: FastifyInstance<Server>;
const registrationStore = new MockRegistrationStore();
describe('Server', () => {
  beforeAll(async () => {
    const shacl = await readUrl('shacl/register.ttl');
    httpServer = await server(
      new MockDatasetStore(),
      registrationStore,
      new MockAllowedRegistrationDomainStore(),
      new ShaclValidator(shacl),
      shacl,
      '/',
      {logger: true}
    );

    nock.back.fixtures = dirname(fileURLToPath(import.meta.url)) + '/http';
    nock.back.setMode('record');
  });

  afterAll(() => {
    nock.restore();
  });

  it('shows documentation', async () => {
    const redirect = await httpServer.inject({
      method: 'GET',
      url: '/',
      headers: {Accept: '*/*'},
    });
    expect(redirect.statusCode).toEqual(302);

    const response = await httpServer.inject({
      method: 'GET',
      url: redirect.headers.location?.toString(),
      headers: {Accept: '*/*'},
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
      headers: {'Content-Type': 'application/ld+json'},
      payload: JSON.stringify({
        '@id': 'https://example.com/404',
      }),
    });
    expect(response.statusCode).toEqual(404);
  });

  it('rejects validation requests that point to URL with empty response', async () => {
    nock('https://example.com/').get('/200').reply(200, '');
    const response = await httpServer.inject({
      method: 'PUT',
      url: '/datasets/validate',
      headers: {'Content-Type': 'application/ld+json'},
      payload: JSON.stringify({
        '@id': 'https://example.com/200',
      }),
    });
    expect(response.statusCode).toEqual(406);
  });

  it('responds with 200 to valid dataset requests', async () => {
    const {nockDone} = await nock.back('valid-dataset.json');
    const response = await httpServer.inject({
      method: 'PUT',
      url: '/datasets/validate',
      headers: {'Content-Type': 'application/ld+json'},
      payload: JSON.stringify({
        '@id': 'https://demo.netwerkdigitaalerfgoed.nl/datasets/kb/2.html',
      }),
    });
    nockDone();
    expect(response.statusCode).toEqual(200);
    expect(response.payload).not.toEqual('');
  });

  it('validates JSON-LD dataset description in request body', async () => {
    const response = await httpServer.inject({
      method: 'POST',
      url: '/datasets/validate',
      headers: {'Content-Type': 'application/ld+json'},
      payload: await file('dataset-schema-org-invalid.jsonld'),
    });
    expect(response.statusCode).toEqual(400);
  });

  it('validates Turtle dataset description in request body', async () => {
    const response = await httpServer.inject({
      method: 'POST',
      url: '/datasets/validate',
      headers: {'Content-Type': 'text/turtle'},
      payload: await file('dataset-schema-org-valid.ttl'),
    });
    expect(response.statusCode).toEqual(200);
  });

  it('handles invalid JSON-LD in request body', async () => {
    const response = await httpServer.inject({
      method: 'POST',
      url: '/datasets/validate',
      headers: {'Content-Type': 'application/ld+json'},
      payload: 'This is not JSON-LD',
    });
    expect(response.statusCode).toEqual(400);
  });

  it('handles invalid Turtle in request body', async () => {
    const response = await httpServer.inject({
      method: 'POST',
      url: '/datasets/validate',
      headers: {'Content-Type': 'text/turtle'},
      payload: 'This is not Turtle',
    });
    expect(response.statusCode).toEqual(400);
  });

  it('responds with validation errors to invalid dataset requests', async () => {
    const {nockDone} = await nock.back('invalid-dataset.json');
    const response = await httpServer.inject({
      method: 'PUT',
      url: '/datasets/validate',
      headers: {'Content-Type': 'application/ld+json', Accept: 'text/turtle'},
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
    const {nockDone} = await nock.back('utf8-bom.json');
    const response = await httpServer.inject({
      method: 'PUT',
      url: '/datasets/validate',
      headers: {'Content-Type': 'application/ld+json'},
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
      .reply(200, {'@id': null}, {'Content-Type': 'application/ld+json'});
    const response = await httpServer.inject({
      method: 'PUT',
      url: '/datasets/validate',
      headers: {'Content-Type': 'application/ld+json'},
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
      headers: {'Content-Type': 'application/ld+json'},
      payload: JSON.stringify({
        '@id': 'https://subdomain.not-allowed.com/dataset',
      }),
    });
    expect(response.statusCode).toEqual(403);
  });

  it('accepts authorized domains', async () => {
    const {nockDone} = await nock.back('post-dataset.json');
    const response = await httpServer.inject({
      method: 'POST',
      url: '/datasets',
      headers: {'Content-Type': 'application/ld+json'},
      payload: JSON.stringify({
        '@id': 'https://demo.netwerkdigitaalerfgoed.nl/datasets/kb/2.html',
      }),
    });
    nockDone();
    expect(response.statusCode).toEqual(202);
    expect(response.payload).not.toEqual('');
  });

  it('responds with validation errors when adding an invalid dataset', async () => {
    const {nockDone} = await nock.back('invalid-dataset.json');
    const response = await httpServer.inject({
      method: 'POST',
      url: '/datasets',
      headers: {'Content-Type': 'application/ld+json', Accept: 'text/turtle'},
      payload: JSON.stringify({
        '@id': 'https://demo.netwerkdigitaalerfgoed.nl/datasets/kb/2a.html',
      }),
    });
    nockDone();
    expect(response.statusCode).toEqual(400);
    expect(response.payload).not.toEqual('');
  });

  it('stores registration even if fetching datasets fails', async () => {
    const {nockDone} = await nock.back('post-dataset-query-fails.json');
    const response = await httpServer.inject({
      method: 'POST',
      url: '/datasets',
      headers: {'Content-Type': 'application/ld+json'},
      payload: JSON.stringify({
        '@id': 'https://netwerkdigitaalerfgoed.nl/fails',
      }),
    });
    nockDone();

    // Validation succeeds, so 202 to the client, even if fetching datasets fails.
    expect(response.statusCode).toEqual(202);
    expect(
      registrationStore.isRegistered(
        new URL('https://netwerkdigitaalerfgoed.nl/fails')
      )
    ).toBe(true);
  });

  it('returns SHACL graph', async () => {
    const response = await httpServer.inject({
      method: 'GET',
      url: '/shacl',
      headers: {'Content-Type': 'text/turtle'},
    });
    expect(response.statusCode).toEqual(200);
    expect(response.payload).not.toEqual('');
  });
});
