/**
 * Schema.org release 30.1 removed every `@type` keyword from its published JSON-LD
 * context (schemaorg/schemaorg#4854). `"mainEntityOfPage": "https://example.com/page"`
 * now expands to a literal instead of an IRI, and `"dateModified": "2025-12-01"` to a
 * plain string. Because a JSON-LD parser fetches that context while parsing, the change
 * reached the register without a deploy and flipped 2105 registrations to invalid
 * overnight.
 *
 * So we answer schema.org’s context URLs from our own context, which carries the typings
 * the shapes and the CONSTRUCT depend on. Publishers keep writing plain schema.org and
 * are asked for nothing. The same file is published at https://def.nde.nl/context.jsonld,
 * so a third party pointing their `@context` at it gets the verdict we get.
 *
 * This reaches JSON-LD only, which is why `StandardizeSchemaOrgPrefixToHttps` stays: a
 * Turtle document written against `http://schema.org/` has no context to correct it, and
 * a quoted string in Turtle is a literal because its author chose one.
 */
import { FetchDocumentLoader } from 'jsonld-context-parser';
import { JsonLdParser } from 'jsonld-streaming-parser';
import type { Transform } from 'node:stream';
import schemaOrgContext from './schema-org-context.json' with { type: 'json' };

const contextDocument = JSON.stringify(schemaOrgContext);

/**
 * Every URL a document can name to mean “schema.org’s context”. Schema.org serves the
 * context from its apex and from `docs/jsonldcontext.jsonld`; registrations in the wild
 * use both, over either scheme, with and without the trailing slash.
 */
const schemaOrgContextUrls = new Set([
  'http://schema.org',
  'http://schema.org/',
  'https://schema.org',
  'https://schema.org/',
  'http://schema.org/docs/jsonldcontext.json',
  'http://schema.org/docs/jsonldcontext.jsonld',
  'https://schema.org/docs/jsonldcontext.json',
  'https://schema.org/docs/jsonldcontext.jsonld',
]);

export function isSchemaOrgContextUrl(url: string): boolean {
  return schemaOrgContextUrls.has(url);
}

/**
 * Wrap a `fetch` so that requests for schema.org’s context are served from the bundled
 * file instead of the network. Everything else passes through untouched, so the caller’s
 * timeout and abort behaviour is preserved.
 */
export function withSchemaOrgContext(
  baseFetch: typeof globalThis.fetch,
): typeof globalThis.fetch {
  return (input, init) => {
    if (isSchemaOrgContextUrl(requestUrl(input))) {
      return Promise.resolve(
        new Response(contextDocument, {
          headers: { 'content-type': 'application/ld+json' },
        }),
      );
    }
    return baseFetch(input, init);
  };
}

/**
 * A JSON-LD parser that resolves schema.org’s context to ours. Callers that parse JSON-LD
 * directly – rather than through `rdf-dereference`, which takes a `fetch` – must use this
 * instead of constructing a bare `JsonLdParser`, or they fetch the live context and read a
 * registration under different semantics than the crawler does.
 */
export function createJsonLdParser(): Transform {
  return new JsonLdParser({
    documentLoader: new FetchDocumentLoader((input, init) =>
      withSchemaOrgContext((url, options) => globalThis.fetch(url, options))(
        input,
        init,
      ),
    ),
  }) as unknown as Transform;
}

function requestUrl(input: Parameters<typeof globalThis.fetch>[0]): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}
