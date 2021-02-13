import nock from 'nock';
import {FastifyInstance} from 'fastify';
import {Server} from 'http';
import DatasetExt from 'rdf-ext/lib/Dataset';
import {server} from '../src/server';
import {ShaclValidator} from '../src/validator';
import {Registration, RegistrationStore} from '../src/registration';

const datasetStore = {
  store: (datasets: DatasetExt[]) => {},
};

class MockRegistrationStore implements RegistrationStore {
  findRegistrationsReadBefore(date: Date): Promise<Registration[]> {
    return Promise.resolve([]);
  }

  store(registration: Registration): void {}
}

let httpServer: FastifyInstance<Server>;
describe('Server', () => {
  beforeAll(async () => {
    httpServer = await server(
      datasetStore,
      new MockRegistrationStore(),
      await ShaclValidator.fromUrl('shacl/dataset.jsonld')
    );

    nock.back.fixtures = __dirname + '/http';
    nock.back.setMode('record');
  });

  afterAll(() => {
    nock.restore();
  });

  it('rejects validation requests without URL', async () => {
    const response = await httpServer.inject({
      method: 'PUT',
      url: '/datasets/validate',
    });
    expect(response.statusCode).toEqual(400);
  });

  it('rejects validation requests that point to 404 URL', async () => {
    const response = await httpServer.inject({
      method: 'PUT',
      url: '/datasets/validate',
    });
    expect(response.statusCode).toEqual(400);
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
  });

  it('responds with validation errors to invalid dataset requests', async () => {
    const {nockDone} = await nock.back('invalid-dataset.json');
    const response = await httpServer.inject({
      method: 'PUT',
      url: '/datasets/validate',
      headers: {'Content-Type': 'application/ld+json'},
      payload: JSON.stringify({
        '@id': 'https://demo.netwerkdigitaalerfgoed.nl/datasets/kb/2a.html',
      }),
    });
    nockDone();
    expect(response.statusCode).toEqual(400);
  });
});
