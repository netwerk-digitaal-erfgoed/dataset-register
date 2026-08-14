import type { RequestHandler } from './$types';
import { searchGraphQLHandler } from '$lib/services/search/engine.server';

/**
 * The GraphQL search endpoint. The browser’s dataset listing queries it
 * same-origin (`/graphql`); the same handler is also reachable at the public
 * search subdomain (an ingress alias to this pod) for external consumers.
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
export const POST: RequestHandler = ({ request }) =>
  searchGraphQLHandler()(request);

export const GET: RequestHandler = ({ request }) =>
  searchGraphQLHandler()(request);
