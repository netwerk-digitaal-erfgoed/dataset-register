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
 * It restores 11 of the 125 typings schema.org last published, NOT all of them: every term
 * the shapes and the CONSTRUCT reference, and nothing else. That is deliberate – three of
 * the rest admit a non-date, which is the bug schema.org was right to fix. The cost is that
 * adding a schema.org term to `requirements/shacl.ttl` or to `query.ts` means checking
 * whether it used to be typed: `url`, `image` and `logo` were `@id`, and would otherwise
 * arrive as literals with nothing to warn you.
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

/** Where the same file is published, for third parties to point their `@context` at. */
export const PUBLISHED_CONTEXT_URL = 'https://def.nde.nl/context.jsonld';

/**
 * Every URL a document can name to mean a context we answer ourselves. Schema.org serves
 * its context from the apex, from `docs/jsonldcontext.jsonld` and from the versioned
 * `version/latest/` files, over either scheme. Our own published URL is here too: a
 * description that cites it is one we can answer from disk, which saves a network round
 * trip and means the hosted copy can never disagree with the bundled one.
 *
 * Compared as normalized hrefs, so the host’s case and a missing trailing slash do not
 * decide whether a registration parses correctly.
 */
const contextUrls = new Set(
  [
    'http://schema.org/',
    'https://schema.org/',
    'http://schema.org/docs/jsonldcontext.json',
    'https://schema.org/docs/jsonldcontext.json',
    'http://schema.org/docs/jsonldcontext.jsonld',
    'https://schema.org/docs/jsonldcontext.jsonld',
    'http://schema.org/version/latest/schemaorg-current-http.jsonld',
    'https://schema.org/version/latest/schemaorg-current-http.jsonld',
    'http://schema.org/version/latest/schemaorg-current-https.jsonld',
    'https://schema.org/version/latest/schemaorg-current-https.jsonld',
    PUBLISHED_CONTEXT_URL,
  ].map(normalizeUrl),
);

export function isSchemaOrgContextUrl(url: string): boolean {
  return contextUrls.has(normalizeUrl(url));
}

/**
 * `URL.parse` returns null rather than throwing, so a value that is not a URL at all
 * simply never matches instead of taking down the parse.
 */
function normalizeUrl(url: string): string {
  return URL.parse(url)?.href ?? url;
}

/**
 * Wrap a `fetch` so that requests for schema.org’s context are served from the bundled
 * file instead of the network. Everything else passes through untouched, so the caller’s
 * timeout and abort behaviour is preserved.
 */
export function withSchemaOrgContext(
  baseFetch: typeof globalThis.fetch = (input, init) =>
    globalThis.fetch(input, init),
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
    documentLoader: new FetchDocumentLoader(withSchemaOrgContext()),
  }) as unknown as Transform;
}

/**
 * Read the URL out of whatever `fetch` was handed: Comunica and rdf-dereference pass a
 * string, a `URL` or a `Request` depending on the path taken. Only `Request` carries a
 * `url` property, and testing for it rather than for `instanceof` keeps this working on a
 * ponyfilled object from another realm, which would fail the instance check and silently
 * stop the interception – see the `@whatwg-node/fetch` Response problem.
 */
function requestUrl(input: Parameters<typeof globalThis.fetch>[0]): string {
  return typeof input === 'object' && 'url' in input
    ? input.url
    : String(input);
}
