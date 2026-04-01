import fastify, {
  FastifyError,
  FastifyInstance,
  FastifyReply,
  FastifyServerOptions,
} from 'fastify';
import bearerAuth from '@fastify/bearer-auth';
import {
  AllowedRegistrationDomainStore,
  DatasetStore,
  dereference,
  discoverDatacatalog,
  extractIri,
  fetch,
  FetchError,
  HttpError,
  NoDatasetFoundAtUrl,
  RatingStore,
  Registration,
  registrationsCounter,
  RegistrationStore,
  validationsCounter,
  Validator,
} from '@dataset-register/core';
import DatasetExt from 'rdf-ext/lib/Dataset.js';
import { fileURLToPath, URL } from 'url';
import { Server } from 'http';
import * as psl from 'psl';
import fastifySwagger from '@fastify/swagger';
import fastifyCors from '@fastify/cors';
import fastifyRdf from '@lde/fastify-rdf';
import fastifySwaggerUi from '@fastify/swagger-ui';
import type { DatasetCore } from '@rdfjs/types';
import { dirname } from 'node:path';

export async function server(
  datasetStore: DatasetStore,
  registrationStore: RegistrationStore,
  allowedRegistrationDomainStore: AllowedRegistrationDomainStore,
  validator: Validator,
  shacl: DatasetCore,
  docsUrl = '/',
  options?: FastifyServerOptions,
  ratingStore?: RatingStore,
  apiAccessToken?: string,
): Promise<FastifyInstance<Server>> {
  const server = fastify(options);

  const __dirname = dirname(fileURLToPath(import.meta.url));

  server
    .register(fastifySwagger, {
      mode: 'static',
      specification: {
        path: __dirname + '/assets/api.yaml',
        baseDir: __dirname,
      },
    })
    .register(fastifySwaggerUi, {
      routePrefix: docsUrl,
    })
    .register(fastifyRdf, {
      defaultContentType: 'application/ld+json',
    })
    .register(fastifyCors, {
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE'],
    })
    // Workaround: content type parser JSON.parse errors lack statusCode.
    // See https://github.com/ldengine/lde/issues/187
    .setErrorHandler(async (error: FastifyError, _request, reply) => {
      if (!error.statusCode && error instanceof SyntaxError) {
        error.statusCode = 400;
      }
      return reply.code(error.statusCode ?? 500).send(error);
    });

  const datasetsRequest = {
    schema: {
      body: {
        type: 'object',
        required: ['@id'],
        properties: {
          '@id': { type: 'string' },
        },
      },
    },
  };

  async function resolveDataset(
    url: URL,
    reply: FastifyReply,
  ): Promise<{ url: URL; data: DatasetExt } | null> {
    try {
      const data = await dereference(url);

      if (data.size === 0) {
        reply.log.info(
          `No data at ${url.toString()}, trying /.well-known/datacatalog`,
        );
        const discovered = await discoverDatacatalog(url);
        if (discovered) {
          return discovered;
        }
      }

      return { url, data };
    } catch (e) {
      if (e instanceof HttpError) {
        reply.log.info(
          `Error at URL ${url.toString()}: ${e.statusCode} ${e.message}`,
        );
        await reply.sendHydraError(
          Object.assign(e, {
            statusCode: e.statusCode === 404 ? 404 : 406,
          }),
        );
        return null;
      }

      if (e instanceof FetchError) {
        reply.log.info(
          `No dataset found at URL ${url.toString()}: ${e.message}`,
        );
        await reply.sendHydraError(Object.assign(e, { statusCode: 406 }));
        return null;
      }

      return null;
    }
  }

  async function validate(
    dataset: DatasetCore,
    reply: FastifyReply,
    url?: URL,
  ) {
    const validation = await validator.validate(dataset);

    switch (validation.state) {
      case 'valid':
        await reply.sendRdf(validation.errors);
        return true;
      case 'no-dataset': {
        const error = url
          ? new NoDatasetFoundAtUrl(url)
          : new Error('No dataset found in submitted data', {
              cause:
                'The provided data does not contain any dcat:Dataset or schema:Dataset resources. Please ensure your data includes at least one dataset description.',
            });
        await reply.sendHydraError(Object.assign(error, { statusCode: 406 }));
        return false;
      }
      case 'invalid': {
        await reply.code(400).sendRdf(validation.errors);
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
      result.input,
    );
  }

  server.post('/datasets', datasetsRequest, async (request, reply) => {
    const submittedUrl = new URL((request.body as { '@id': string })['@id']);
    if (!(await domainIsAllowed(submittedUrl))) {
      return reply.code(403).send();
    }

    const resolved = await resolveDataset(submittedUrl, reply);

    const valid = resolved
      ? await validate(resolved.data, reply.code(202), resolved.url)
      : false;
    if (resolved && valid) {
      const { url, data } = resolved;
      // The URL has validated, so any problems with processing the dataset are now ours. Therefore, make sure to
      // store the registration so we can come back to that when crawling, even if fetching the datasets fails.
      // Store first rather than wrapping in a try/catch to cope with OOMs.
      // Keep original datePosted if re-registering an existing URL.
      const existingRegistration = await registrationStore.findByUrl(url);
      const datePosted = existingRegistration?.datePosted ?? new Date();
      const registration = new Registration(url, datePosted);
      await registrationStore.store(registration);

      // Fetch dataset descriptions and store them.
      const datasetIris: URL[] = [];
      for await (const dataset of fetch(url, data)) {
        datasetIris.push(extractIri(dataset));
        await datasetStore.store(dataset);
      }

      request.log.info(
        `Found ${datasetIris.length} datasets at ${url.toString()}`,
      );

      // Update registration with dataset descriptions that we found.
      const updatedRegistration = registration.read(datasetIris, 200, true);
      await registrationStore.store(updatedRegistration);
    }

    registrationsCounter.add(1, {
      valid,
    });

    // If the dataset did not validate, the validate() function has set a 4xx status code.
    return reply;
  });

  server.put('/datasets/validate', datasetsRequest, async (request, reply) => {
    const url = new URL((request.body as { '@id': string })['@id']);
    request.log.info(url.toString());
    const resolved = await resolveDataset(url, reply);

    if (resolved) {
      await validate(resolved.data, reply, resolved.url);
    }
    validationsCounter.add(1, {
      status: reply.statusCode,
    });
    request.log.info(
      `Validated at ${Math.round(
        process.memoryUsage().rss / 1024 / 1024,
      )} MB memory`,
    );
    return reply;
  });

  server.post(
    '/datasets/validate',
    { config: { parseRdf: true } },
    async (request, reply) => {
      await validate(request.body as DatasetCore, reply);
      validationsCounter.add(1, {
        status: reply.statusCode,
      });
      return reply;
    },
  );

  server.get('/shacl', async (_request, reply) => {
    return reply.sendRdf(shacl);
  });

  server.get('/allowed-domains', async (request, reply) => {
    const { url: urlParam } = request.query as { url?: string };
    if (!urlParam) {
      return reply.code(400).send();
    }

    let url: URL;
    try {
      url = new URL(urlParam);
    } catch {
      return reply.code(400).send();
    }

    if (await domainIsAllowed(url)) {
      return reply.code(200).send();
    }

    return reply.code(404).send();
  });

  // Protected routes requiring API access token
  if (apiAccessToken) {
    await server.register(async function protectedRoutes(protectedServer) {
      await protectedServer.register(bearerAuth, { keys: [apiAccessToken] });

      protectedServer.delete('/datasets', async (request, reply) => {
        const { url: urlParam } = request.query as { url?: string };
        if (!urlParam) {
          return reply.code(400).send();
        }

        let url: URL;
        try {
          url = new URL(urlParam);
        } catch {
          return reply.code(400).send();
        }

        const registration = await registrationStore.findByUrl(url);
        if (!registration) {
          return reply.code(404).send();
        }

        // Delete ratings and dataset graphs for each dataset
        for (const datasetIri of registration.datasets) {
          await ratingStore?.delete(datasetIri);
          await datasetStore.delete(datasetIri);
        }

        // Delete the registration (including linked dataset entries in registrations graph)
        await registrationStore.delete(url);

        request.log.info(
          `Deleted registration ${url.toString()} with ${registration.datasets.length} datasets`,
        );

        return reply.code(204).send();
      });
    });
  }

  return server;
}
