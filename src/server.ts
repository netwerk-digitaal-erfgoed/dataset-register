import fastify, {
  FastifyInstance,
  FastifyReply,
  FastifyServerOptions,
} from 'fastify';
import {Validator} from './validator';
import {toStream} from 'rdf-dataset-ext';
import {dereference, fetch, NoDatasetFoundAtUrl, UrlNotFound} from './fetch';
import DatasetExt from 'rdf-ext/lib/Dataset';
import {URL} from 'url';
import {
  AllowedRegistrationDomainStore,
  Registration,
  RegistrationStore,
} from './registration';
import {DatasetStore, extractIris} from './dataset';
import {Server} from 'http';
import * as psl from 'psl';
import rdfSerializer from 'rdf-serialize';
import fastifySwagger from 'fastify-swagger';
import fastifyCors from 'fastify-cors';
import {DatasetCore} from 'rdf-js';

const serializer = (contentType: string) => (dataset: DatasetExt) =>
  rdfSerializer.serialize(toStream(dataset), {contentType});

export async function server(
  datasetStore: DatasetStore,
  registrationStore: RegistrationStore,
  allowedRegistrationDomainStore: AllowedRegistrationDomainStore,
  validator: Validator,
  shacl: DatasetCore,
  docsUrl = '/',
  options?: FastifyServerOptions
): Promise<FastifyInstance<Server>> {
  const server = fastify(options);

  server
    .register(fastifySwagger, {
      mode: 'static',
      specification: {
        baseDir: __dirname,
        path: './assets/api.yaml',
      },
      exposeRoute: true,
      routePrefix: docsUrl,
    })
    .register(require('fastify-accepts-serializer'), {
      // Doesn't work, so Accept header is required.
      // default: 'application/ld+json',
    })
    .register(fastifyCors)
    .addHook('onRequest', async (request, reply) => {
      if (request.headers.accept === undefined) {
        request.headers.accept = 'application/ld+json';
      }
    });

  const rdfSerializerConfig = {
    config: {
      default: 'application/ld+json',
      serializers: [
        ...(await rdfSerializer.getContentTypes()).map(contentType => {
          return {
            regex: new RegExp(contentType.replace('+', '\\+')),
            serializer: serializer(contentType),
          };
        }),
      ],
    },
  };

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
        reply.log.info(`URL ${url.toString()} not found`);
        reply.code(404).send();
      }
      if (e instanceof NoDatasetFoundAtUrl) {
        reply.log.info(`No dataset found at URL ${url.toString()}`);
        reply.code(406).send();
      }
      return null;
    }

    const validation = await validator.validate(dataset);
    switch (validation.state) {
      case 'valid':
        reply.send(validation.errors);
        return dataset;
      case 'no-dataset':
        reply.code(406).send();
        return null;
      case 'invalid': {
        reply.code(400).send(validation.errors);
        return null;
      }
    }
  }

  async function domainIsAllowed(url: URL): Promise<boolean> {
    const result = psl.parse(url.hostname);
    if (result.error || result.domain === null) {
      return false;
    }

    return await allowedRegistrationDomainStore.contains(
      result.domain,
      result.input
    );
  }

  server.post(
    '/datasets',
    {...datasetsRequest, ...rdfSerializerConfig},
    async (request, reply) => {
      const url = new URL((request.body as {'@id': string})['@id']);
      request.log.info(url.toString());
      if (!(await domainIsAllowed(url))) {
        reply.code(403).send();
        return;
      }

      reply.code(202);
      if (await validate(url, reply)) {
        const datasets = await fetch(url);
        await datasetStore.store(datasets);
        const registration = new Registration(url, new Date(), [
          ...extractIris(datasets).keys(),
        ]);
        registration.read(200);
        await registrationStore.store(registration);
      }
    }
  );

  server.put(
    '/datasets/validate',
    {...datasetsRequest, ...rdfSerializerConfig},
    async (request, reply) => {
      const url = new URL((request.body as {'@id': string})['@id']);
      request.log.info(url.toString());
      await validate(url, reply);
    }
  );

  server.get('/shacl', rdfSerializerConfig, async (request, reply) => {
    reply.send(shacl);
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
