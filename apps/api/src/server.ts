import fastify, {
  FastifyError,
  FastifyInstance,
  FastifyPluginAsync,
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
  ProbeProgressListener,
  RatingStore,
  Registration,
  registrationsCounter,
  RegistrationStore,
  serializeQuads,
  validationsCounter,
  Validator,
} from '@dataset-register/core';
import DatasetExt from 'rdf-ext/lib/Dataset.js';
import { fileURLToPath, URL } from 'url';
import { Server } from 'http';
import * as psl from 'psl';
import fastifySwagger from '@fastify/swagger';
import fastifyCors from '@fastify/cors';
import fastifySse from '@fastify/sse';
import fastifyRdf from '@lde/fastify-rdf';
import fastifySwaggerUi from '@fastify/swagger-ui';
import type { DatasetCore } from '@rdfjs/types';
import { dirname } from 'node:path';

/** Whether the client asked for a Server-Sent Events response. */
function wantsEventStream(accept: string | undefined): boolean {
  return accept?.includes('text/event-stream') ?? false;
}

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
  /**
   * Called fire-and-forget after a delete removes a registration, so the search
   * index can be rebuilt. Injected (rather than calling the indexer directly) so
   * the HTTP layer stays free of any Typesense dependency and the trigger is
   * unit-testable. `main.ts` wires it to the single-flight rebuild.
   */
  onDatasetsChanged?: () => void,
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
      theme: {
        title: 'NDE Dataset Register API',
      },
      logo: {
        type: 'image/svg+xml',
        content: `<svg viewBox="0 0 266 38" xmlns="http://www.w3.org/2000/svg"> <defs> <style>.st0{fill:white}</style> </defs> <path transform="matrix(0.707094, -0.707119, 0.707119, 0.707094, -11.695065, 28.198312)" class="st0" d="M26.89 22.35h2.61v11.73h-2.61z"></path> <path transform="matrix(0.707094, -0.707119, 0.707119, 0.707094, -3.999806, 9.619853)" class="st0" d="M8.31 3.77h2.61V15.5H8.31z"></path> <path transform="matrix(0.382812, -0.923826, 0.923826, 0.382812, 8.495902, 26.296938)" class="st0" d="M18.06 5.49h11.73V8.1H18.06z"></path> <path transform="matrix(0.382812, -0.923826, 0.923826, 0.382812, -20.135798, 31.990094)" class="st0" d="M8.01 29.76h11.73v2.61H8.01z"></path> <path class="st0" d="M17.6 26.2h2.61v11.73H17.6zM17.6-.08h2.61v11.73H17.6z"></path> <path transform="matrix(0.92388, -0.382683, 0.382683, 0.92388, -10.065885, 11.521379)" class="st0" d="M22.62 25.2h2.61v11.73h-2.61z"></path> <path transform="matrix(0.92388, -0.382683, 0.382683, 0.92388, -1.542401, 5.825825)" class="st0" d="M12.57.92h2.61v11.73h-2.61z"></path> <path transform="matrix(0.382683, -0.92388, 0.92388, 0.382683, -8.666396, 14.829821)" class="st0" d="M5.46 8.03h2.61v11.73H5.46z"></path> <path transform="matrix(0.92388, -0.382683, 0.382683, 0.92388, -2.956749, 12.935421)" class="st0" d="M25.17 12.6H36.9v2.61H25.17z"></path> <path transform="matrix(0.92388, -0.382683, 0.382683, 0.92388, -8.651537, 4.411784)" class="st0" d="M.9 22.65h11.73v2.61H.9z"></path> <path transform="matrix(0.707094, -0.707119, 0.707119, 0.707094, 1.4415, 22.756004)" class="st0" d="M22.32 8.33h11.73v2.61H22.32z"></path> <path transform="matrix(0.707094, -0.707119, 0.707119, 0.707094, -17.136665, 15.061452)" class="st0" d="M3.75 26.91h11.73v2.61H3.75z"></path> <text class="st0" style="font-family: Poppins,Helvetica,Arial,sans-serif;font-size: 27px; font-weight:400;" x="41" y="26">datasetregister</text> <rect x="-0.039" y="17.751" width="43.395" height="2.414" class="st0"></rect></svg>`,
      },
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

  // Await so the plugin’s `onRoute` hook is installed before the routes below
  // are registered; otherwise the `{ sse: true }` wrapper never wraps them.
  // @fastify/sse@0.4.0 ships ESM-style `export default` types in a CJS package,
  // so under nodenext the default import mistypes as the module namespace; at
  // runtime it is the plugin, so cast to the expected plugin type.
  await server.register(fastifySse as unknown as FastifyPluginAsync);

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
        reply.log.info(`Error at URL ${url.toString()}: ${e.message}`);
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

  /**
   * Stream validation over Server-Sent Events: a `progress` event per probed
   * distribution, then a final `report` event (the JSON-LD SHACL report) or an
   * `error` event when no dataset was found. Assumes the dataset was already
   * resolved.
   *
   * Frames go through `@fastify/sse` (`reply.sse`), which formats them, manages
   * the `text/event-stream` headers, and closes the stream when the handler
   * returns — all on the managed reply, so CORS and the other hooks still run.
   */
  async function validateStreaming(
    reply: FastifyReply,
    dataset: DatasetCore,
    url: URL,
  ): Promise<number> {
    // `reply.sse.send` is async and not internally queued, but the probe emits
    // progress from a synchronous callback, so chain the writes to keep frames
    // ordered and ensure they are all flushed before the route wrapper closes.
    let writes = Promise.resolve();
    const send = (message: { event: string; data: unknown }) => {
      writes = writes.then(() => reply.sse.send(message));
      return writes;
    };

    const onProgress: ProbeProgressListener = (completed, total) => {
      void send({ event: 'progress', data: { completed, total } });
    };

    try {
      const validation = await validator.validate(dataset, onProgress);

      if (validation.state === 'no-dataset') {
        const error = new NoDatasetFoundAtUrl(url);
        void send({
          event: 'error',
          data: {
            statusCode: 406,
            title: error.message,
            description: error.cause,
          },
        });
        await writes;
        return 406;
      }

      // Both `valid` and `invalid` carry the SHACL report; the browser reads
      // sh:conforms to tell them apart, exactly as on the non-streaming path.
      // Send the parsed JSON-LD so the plugin's default serializer encodes it
      // like every other frame (no per-frame string/object special-casing).
      void send({
        event: 'report',
        data: JSON.parse(
          await serializeQuads(validation.errors, 'application/ld+json'),
        ),
      });
      await writes;
      // Mirror the non-streaming status so validationsCounter stays comparable
      // across the streaming and one-shot paths.
      return validation.state === 'invalid' ? 400 : 200;
    } catch (error) {
      // validator.validate threw, or a frame write failed (e.g. the client
      // disconnected). The response is already streaming, so surface the cause
      // as an error frame instead of a silent close, and report 500 — what the
      // non-streaming path's error handler would have recorded.
      reply.log.error(error, 'Streaming validation failed');
      try {
        await reply.sse.send({
          event: 'error',
          data: { statusCode: 500, title: 'Validation failed' },
        });
      } catch {
        // The connection is already gone; nothing more we can send.
      }
      return 500;
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

  server.put(
    '/datasets/validate',
    {
      ...datasetsRequest,
      // `@fastify/sse` only engages for `Accept: text/event-stream` requests and
      // calls the original handler unchanged otherwise, so the default JSON-LD
      // response stays byte-for-byte identical for existing clients.
      sse: { heartbeat: false },
    },
    async (request, reply) => {
      const url = new URL((request.body as { '@id': string })['@id']);
      request.log.info(url.toString());
      const resolved = await resolveDataset(url, reply);

      // `wantsEventStream` must match the Accept check `@fastify/sse` uses to set
      // up `reply.sse`; keep them in sync. On a stream the wire status is always
      // 200, so take the logical status from `validateStreaming` for the metric.
      let streaming = false;
      let status = reply.statusCode;
      if (resolved && wantsEventStream(request.headers.accept)) {
        streaming = true;
        status = await validateStreaming(reply, resolved.data, resolved.url);
      } else if (resolved) {
        await validate(resolved.data, reply, resolved.url);
        status = reply.statusCode;
      }
      validationsCounter.add(1, {
        status,
      });
      request.log.info(
        `Validated at ${Math.round(
          process.memoryUsage().rss / 1024 / 1024,
        )} MB memory`,
      );

      // For a stream, return nothing so the @fastify/sse wrapper closes it;
      // otherwise return the reply as usual.
      if (streaming) {
        return;
      }
      return reply;
    },
  );

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

      protectedServer.post(
        '/allowed-domains',
        {
          schema: {
            body: {
              type: 'object',
              required: ['domain'],
              properties: {
                domain: { type: 'string' },
              },
            },
          },
        },
        async (request, reply) => {
          const { domain } = request.body as { domain: string };
          const result = psl.parse(domain);
          if (result.error || result.domain === null) {
            return reply.code(400).send();
          }

          // Skip subdomains whose registrable parent is already allowed:
          // they are already covered transitively.
          if (
            result.input !== result.domain &&
            (await allowedRegistrationDomainStore.contains(result.domain))
          ) {
            return reply.code(204).send();
          }

          await allowedRegistrationDomainStore.add(result.input);

          request.log.info(`Added ${result.input} to allowed domains`);

          return reply.code(204).send();
        },
      );

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

        // Rebuild the search index so the deleted datasets disappear from search.
        // Fire-and-forget under the indexer's cross-pod lock: a slow or failed
        // rebuild must not delay or fail the delete response.
        onDatasetsChanged?.();

        return reply.code(204).send();
      });
    });
  }

  return server;
}
