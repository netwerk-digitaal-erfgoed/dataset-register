import { rdfSerializer } from 'rdf-serialize';
import type { DatasetCore } from '@rdfjs/types';
import { Readable } from 'node:stream';
import jsonld from 'jsonld';
import type { FastifyReply, preSerializationHookHandler } from 'fastify';
import { createHydraError, ErrorResponse } from './error.ts';
import streamToString from 'stream-to-string';

const HYDRA_CONTEXT = {
  '@context': { '@vocab': 'http://www.w3.org/ns/hydra/core#' },
};

// Must be inlined, because SHACL doesn’t offer a dereferenceable JSON-LD context.
// Based on https://github.com/w3c/shacl/blob/main/shacl-jsonld-context/shacl.context.ld.json
const SHACL_CONTEXT = {
  '@context': {
    '@vocab': 'http://www.w3.org/ns/shacl#',
    xsd: 'http://www.w3.org/2001/XMLSchema#',
    result: { '@type': '@id' },
    resultPath: { '@type': '@id' },
    resultSeverity: { '@type': '@id' },
    focusNode: { '@type': '@id' },
    sourceConstraintComponent: { '@type': '@id' },
    sourceShape: { '@type': '@id' },
  },
};

const supportedContentTypes = [
  'application/ld+json',
  'application/n-quads',
  'application/n-triples',
  'application/trig',
  'text/turtle',
  'text/n3',
];

/**
 * Serialize RDF dataset to a string for non-JSON-LD formats.
 */
const serializeToRdf = async (
  dataset: DatasetCore,
  contentType: string,
): Promise<string> => {
  const stream = rdfSerializer.serialize(Readable.from(dataset), {
    contentType,
  });
  return await streamToString(stream);
};

/**
 * Serialize RDF dataset to framed and compact JSON-LD for better readability.
 */
const serializeToJsonLd = async (
  dataset: DatasetCore,
  context: typeof HYDRA_CONTEXT | typeof SHACL_CONTEXT,
): Promise<object> => {
  const json = await jsonld.fromRDF(
    dataset as Parameters<typeof jsonld.fromRDF>[0],
  );
  const framed = await jsonld.frame(json, context);

  // Remove the blank node to improve readability.
  framed['@id'] = undefined;

  return framed;
};

/**
 * Fastify preSerialization hook that handles content negotiation and RDF serialization.
 *
 * We use a preSerialization hook instead of @fastify/accepts-serializer
 * because the latter does not support async serializers, which we need for
 * our use of the jsonld library and stream-to-string conversion.
 */
export const rdfPreSerializationHook: preSerializationHookHandler = async (
  request,
  reply: FastifyReply,
  payload: unknown,
) => {
  const accepts = request.accepts();
  const contentType =
    accepts.type(supportedContentTypes) || ('application/ld+json' as string);

  reply.type(contentType as string);

  const rdf: DatasetCore =
    payload instanceof ErrorResponse
      ? createHydraError(payload.error)
      : (payload as DatasetCore);

  if (contentType === 'application/ld+json') {
    return serializeToJsonLd(
      rdf,
      payload instanceof ErrorResponse ? HYDRA_CONTEXT : SHACL_CONTEXT,
    );
  }

  return serializeToRdf(rdf, contentType as string);
};
