import fastify, {
  FastifyInstance,
  FastifyReply,
  FastifyServerOptions,
} from 'fastify';
import {Validator} from './validator';
import {StreamWriter} from 'n3';
import {toStream} from 'rdf-dataset-ext';
import {dereference, fetch, NoDatasetFoundAtUrl, UrlNotFound} from './fetch';
import DatasetExt from 'rdf-ext/lib/Dataset';
import {URL} from 'url';
import {Registration, RegistrationStore} from './registration';
import {DatasetStore, extractIris} from './dataset';
import {Server} from 'http';

export async function server(
  datasetStore: DatasetStore,
  registrationStore: RegistrationStore,
  validator: Validator,
  options?: FastifyServerOptions
): Promise<FastifyInstance<Server>> {
  const server = fastify(options);
  const datasetsRequest = {
    schema: {
      body: {
        type: 'object',
        required: ['@id'],
        properties: {
          '@id': {type: 'string'},
        },
      },
    },
  };

  async function validate(
    url: URL,
    reply: FastifyReply
  ): Promise<DatasetExt | null> {
    let dataset: DatasetExt;
    try {
      dataset = await dereference(url);
    } catch (e) {
      if (e instanceof UrlNotFound) {
        reply.code(404).send('URL not found: ' + url);
      }
      if (e instanceof NoDatasetFoundAtUrl) {
        reply.code(406).send(e.message);
      }
      return null;
    }

    const validation = await validator.validate(dataset);
    switch (validation.state) {
      case 'valid':
        return dataset;
      case 'no-dataset':
        reply.code(406).send();
        return null;
      case 'invalid': {
        const streamWriter = new StreamWriter();
        const validationRdf = streamWriter.import(toStream(validation.errors));
        reply.code(400).send(validationRdf);
        return null;
      }
    }
  }

  server.post('/datasets', datasetsRequest, async (request, reply) => {
    const url = new URL((request.body as {'@id': string})['@id']);
    request.log.info(url.toString());
    if (await validate(url, reply)) {
      const datasets = await fetch(url);
      reply.code(202).send();
      await datasetStore.store(datasets);
      const registration = new Registration(url, new Date(), [
        ...extractIris(datasets).keys(),
      ]);
      registration.read(200);
      await registrationStore.store(registration);
    }
  });

  server.put('/datasets/validate', datasetsRequest, async (request, reply) => {
    const url = new URL((request.body as {'@id': string})['@id']);
    request.log.info(url.toString());
    if ((await validate(url, reply)) !== null) {
      reply.code(200).send();
    }
  });

  /**
   * Make Fastify accept JSON-LD payloads.
   */
  server.addContentTypeParser(
    'application/ld+json',
    {parseAs: 'string'},
    (req, body: string, done) => {
      try {
        done(null, JSON.parse(body));
      } catch (err) {
        err.statusCode = 400;
        done(err, undefined);
      }
    }
  );

  return server;
}
