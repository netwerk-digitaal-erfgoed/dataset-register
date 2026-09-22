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
import schemaOrgContext from './schema-org-context.json' with { type: 'json' };

const contextDocument = JSON.stringify(schemaOrgContext);

/** Where the same file is published, for third parties to point their `@context` at. */
export const PUBLISHED_CONTEXT_URL = 'https://def.nde.nl/context.jsonld';

/**
 * Whether a URL names a context we answer ourselves.
 *
 * Schema.org serves the same context from its apex, from `docs/jsonldcontext.json(ld)`
 * and from `version/<release>/schemaorg-{current,all}-http(s).jsonld` – which is why this
 * matches the SHAPE of those paths rather than enumerating them. An enumeration went
 * stale twice while this change was being written, and each gap is invisible: a
 * registration citing the variant we missed keeps failing while a byte-identical one
 * citing the apex passes.
 *
 * The path still has to look like a context. This `fetch` also retrieves the registration
 * itself, so matching the whole host would hand the context back to anyone who registered
 * a `schema.org` URL.
 *
 * Our own published URL is here too: a description citing it is one we can answer from
 * disk, which saves a round trip and means the hosted copy can never disagree with the
 * bundled one.
 */
const schemaOrgContextPath =
  /^\/(?:|docs\/jsonldcontext\.json(?:ld)?|version\/[^/]+\/[^/]+\.jsonld)$/;

export function isBundledContextUrl(url: string): boolean {
  const parsed = URL.parse(url);
  if (parsed === null) return false;
  return (
    parsed.href === PUBLISHED_CONTEXT_URL ||
    (parsed.host === 'schema.org' && schemaOrgContextPath.test(parsed.pathname))
  );
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
    if (isBundledContextUrl(requestUrl(input))) {
      // Serving from memory must not make an aborted request look like it succeeded:
      // Comunica cancels a traversal by signalling every request it has in flight, and a
      // context load that ignored that would let the document loader carry on alone.
      if (init?.signal?.aborted) {
        return Promise.reject(init.signal.reason as Error);
      }
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
