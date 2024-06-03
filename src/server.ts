import fastify, {
  FastifyContextConfig,
  FastifyError,
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  FastifyServerOptions,
} from 'fastify';
import {Validator} from './validator.js';
import datasetExt from 'rdf-dataset-ext';
import {dereference, fetch, HttpError, NoDatasetFoundAtUrl} from './fetch.js';
import DatasetExt from 'rdf-ext/lib/Dataset';
import {URL} from 'url';
import {
  AllowedRegistrationDomainStore,
  Registration,
  RegistrationStore,
} from './registration.js';
import {DatasetStore, extractIris, load} from './dataset.js';
import {IncomingMessage, Server} from 'http';
import * as psl from 'psl';
import {rdfSerializer} from './rdf.js';
import fastifySwagger from '@fastify/swagger';
import fastifyCors from '@fastify/cors';
import {DatasetCore} from 'rdf-js';
import acceptsSerializer from '@fastify/accepts-serializer';
import fastifySwaggerUi from '@fastify/swagger-ui';
import {registrationsCounter, validationsCounter} from './instrumentation.js';

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
    default: 'application/ld+json',
    serializers: [
      ...(await rdfSerializer.getContentTypes()).map(contentType => {
        return {
          regex: new RegExp(contentType.replace('+', '\\+')),
          serializer: serializer(contentType),
        };
      }),
    ],
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

  async function resolveDataset(
    url: URL,
    reply: FastifyReply
  ): Promise<DatasetExt | null> {
    try {
      return await dereference(url);
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
  }

  async function validate(dataset: DatasetExt, reply: FastifyReply) {
    const validation = await validator.validate(dataset);

    switch (validation.state) {
      case 'valid':
        reply.send(validation.errors);
        return true;
      case 'no-dataset':
        reply.code(406).send();
        return false;
      case 'invalid': {
        reply.code(400).send(validation.errors);
        return false;
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
    {...datasetsRequest, config: rdfSerializerConfig},
    async (request, reply) => {
      const url = new URL((request.body as {'@id': string})['@id']);
      if (!(await domainIsAllowed(url))) {
        reply.code(403).send();
        return;
      }

      reply.code(202); // The validate function will reply.send() with any validation warnings.
      const dataset = await resolveDataset(url, reply);
      const valid = dataset ? await validate(dataset, reply) : false;
      if (dataset && valid) {
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

      registrationsCounter.add(1, {
        valid,
      });

      // If the dataset did not validate, the validate() function has set a 4xx status code.
      return reply;
    }
  );

  server.put(
    '/datasets/validate',
    {...datasetsRequest, config: rdfSerializerConfig},
    async (request, reply) => {
      const url = new URL((request.body as {'@id': string})['@id']);
      request.log.info(url.toString());
      const dataset = await resolveDataset(url, reply);
      if (dataset) {
        await validate(dataset, reply);
      }
      validationsCounter.add(1, {
        status: reply.statusCode,
      });
      request.log.info(
        `Validated at ${Math.round(
          process.memoryUsage().rss / 1024 / 1024
        )} MB memory`
      );
      return reply;
    }
  );

  server.post(
    '/datasets/validate',
    {config: {...rdfSerializerConfig, parseRdf: true}},
    async (request, reply) => {
      await validate(request.body as DatasetExt, reply);
      validationsCounter.add(1, {
        status: reply.statusCode,
      });
      return reply;
    }
  );

  server.get(
    '/shacl',
    {config: rdfSerializerConfig},
    async (request, reply) => {
      return reply.send(shacl);
    }
  );

  /**
   * If a route has enabled `parseRdf`, parse RDF into a DatasetExt object. If not, parse as JSON.
   */
  server.addContentTypeParser(
    ['application/ld+json', 'text/turtle', 'text/n3', 'application/trig'],
    async (request: FastifyRequest, payload: IncomingMessage) => {
      if (request.routeConfig.parseRdf ?? false) {
        try {
          return await load(
            request.raw,
            request.headers['content-type'] ?? 'application/ld+json'
          );
        } catch (e) {
          (e as FastifyError).statusCode = 400;
          return new Promise((resolve, error) => error(e));
        }
      }

      // Parse simple JSON-LD as JSON.
      return new Promise(resolve => {
        let data = '';
        payload.on('data', chunk => {
          data += chunk;
        });
        payload.on('end', () => {
          resolve(JSON.parse(data));
        });
      });
    }
  );

  return server;
}


declare module "fastify" {
  export interface FastifyContextConfig {
    /**
     * If enabled, the RDF request body will be parsed into a DatasetExt object by the content parser.
     */
    parseRdf?: boolean;
  }
}
