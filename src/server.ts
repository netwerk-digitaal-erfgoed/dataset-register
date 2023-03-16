import fastify, {
  FastifyInstance,
  FastifyReply,
  FastifyServerOptions,
} from 'fastify';
import {Validator} from './validator';
import datasetExt from 'rdf-dataset-ext';
import {dereference, fetch, HttpError, NoDatasetFoundAtUrl} from './fetch';
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
import {rdfSerializer} from './rdf';
import fastifySwagger from '@fastify/swagger';
import fastifyCors from '@fastify/cors';
import {DatasetCore} from 'rdf-js';
import acceptsSerializer from '@fastify/accepts-serializer';
import fastifySwaggerUi from '@fastify/swagger-ui';

const serializer =
  (contentType: string) =>
  // Set return type any to make returning Stream work with fastify-accepts 5.1.0.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (dataset: DatasetExt): any =>
    rdfSerializer.serialize(datasetExt.toStream(dataset), {contentType});

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
        path: './assets/api.yaml',
        baseDir: process.cwd(),
      },
    })
    .register(fastifySwaggerUi, {
      baseDir: process.cwd(),
      routePrefix: docsUrl,
    })
    .register(acceptsSerializer, {
      default: 'application/ld+json', // default doesn't work, so Accept header is required.
    })
    .register(fastifyCors)
    .addHook('onRequest', async request => {
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
      if (e instanceof HttpError) {
        reply.log.info(
          `Error at URL ${url.toString()}: ${e.statusCode} ${e.message}`
        );
        if (e.statusCode === 404) {
          reply.code(404).send();
        } else {
          reply.code(406).send();
        }
      }

      if (e instanceof NoDatasetFoundAtUrl) {
        reply.log.info(
          `No dataset found at URL ${url.toString()}: ${e.message}`
        );
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
      if (!(await domainIsAllowed(url))) {
        reply.code(403).send();
        return;
      }

      reply.code(202); // The validate function will reply.send() with any validation warnings.
      if (await validate(url, reply)) {
        // The URL has validated, so any problems with processing the dataset are now ours. Therefore, make sure to
        // store the registration so we can come back to that when crawling, even if fetching the datasets fails.
        // Store first rather than wrapping in a try/catch to cope with OOMs.
        const registration = new Registration(url, new Date());
        await registrationStore.store(registration);

        // Fetch dataset descriptions and store them.
        const datasets = await fetch(url);
        request.log.info(
          `Found ${datasets.length} datasets at ${url.toString()}`
        );
        await datasetStore.store(datasets);

        // Update registration with dataset descriptions that we found.
        const updatedRegistration = registration.read(
          [...extractIris(datasets).keys()],
          200,
          true
        );
        await registrationStore.store(updatedRegistration);
      }

      // If the dataset did not validate, the validate() function has set a 4xx status code.
      return reply;
    }
  );

  server.put(
    '/datasets/validate',
    {...datasetsRequest, ...rdfSerializerConfig},
    async (request, reply) => {
      const url = new URL((request.body as {'@id': string})['@id']);
      request.log.info(url.toString());
      await validate(url, reply);
      request.log.info(
        `Validated at ${Math.round(
          process.memoryUsage().rss / 1024 / 1024
        )} MB memory`
      );
      return reply;
    }
  );

  server.get('/shacl', rdfSerializerConfig, async (request, reply) => {
    return reply.send(shacl);
  });

  /**
   * Make Fastify accept JSON-LD payloads.
   */
  server.addContentTypeParser(
    'application/ld+json',
    {parseAs: 'string'},
    server.getDefaultJsonParser('ignore', 'ignore')
  );

  return server;
}
