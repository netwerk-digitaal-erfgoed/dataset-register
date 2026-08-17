import type { RequestHandler } from './$types';
import { searchGraphQLHandler } from '$lib/services/search/engine.server';

/**
 * The GraphQL search endpoint. The browser’s dataset listing queries it
 * same-origin (`/graphql`), and it is the Register’s public search API: the
 * ingress routes `/graphql` on the main host to this pod. (There is no separate
 * search subdomain – the former `search.datasetregister…` served the retired
 * client-direct-to-Typesense path, and Typesense now has no ingress at all.)
 *
 * The endpoint itself is `@lde/search-api-graphql`’s framework-agnostic `fetch`
 * handler, mounted as-is: `POST` executes, `GET` serves the self-contained
 * GraphiQL playground, and `GET ?sdl` returns the schema contract without an
 * introspection round trip. It also brings CORS and the query depth/cost limits
 * a public endpoint needs, which the previous bespoke route had none of.
 *
 * Server-only: it runs the Typesense engine (`engine.server.ts`), so the
 * Typesense key never leaves the server. The active UI locale rides in on the
 * `Accept-Language` header, which the handler negotiates (q-values respected)
 * into the query’s output-language preference.
 */
/**
 * Re-wrap the handler's response in the platform `Response`.
 *
 * graphql-yoga answers with `@whatwg-node/fetch`'s ponyfilled `Response`, which
 * is a different class from the global one even where the shapes match.
 * SvelteKit endpoint results are checked with `instanceof Response` against the
 * global, so returning yoga's object directly fails that check and the route 500s
 * with “handler should return a Response object” – for every request, including
 * the playground. Copying it across the realm boundary is the whole fix; the body
 * is passed through as a stream, so this buffers nothing.
 */
async function respond(request: Request): Promise<Response> {
  const response = await searchGraphQLHandler()(request);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export const POST: RequestHandler = ({ request }) => respond(request);

export const GET: RequestHandler = ({ request }) => respond(request);
