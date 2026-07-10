import { error, json } from '@sveltejs/kit';
import { graphql } from 'graphql';
import type { RequestHandler } from './$types';
import {
  searchContext,
  searchGraphQLSchema,
} from '$lib/services/search/engine.server';

/**
 * The GraphQL search endpoint. The browser’s dataset listing queries it
 * same-origin (`/graphql`); the same handler is also reachable at the public
 * search subdomain (an ingress alias to this pod) for external consumers.
 *
 * Server-only: it runs the Typesense engine (`engine.server.ts`), so the
 * Typesense key never leaves the server. The active UI locale rides in on the
 * `Accept-Language` header and becomes the query’s output-language preference.
 */
export const POST: RequestHandler = async ({ request }) => {
  let body: { query?: unknown; variables?: unknown };
  try {
    body = await request.json();
  } catch {
    error(400, 'Request body must be JSON.');
  }
  if (typeof body.query !== 'string') {
    error(400, 'A GraphQL `query` string is required.');
  }

  const result = await graphql({
    schema: searchGraphQLSchema(),
    source: body.query,
    variableValues: (body.variables ?? undefined) as
      Record<string, unknown> | undefined,
    contextValue: searchContext(
      parseAcceptLanguage(request.headers.get('accept-language')),
    ),
  });
  return json(result);
};

/**
 * The ordered language tags from an `Accept-Language` header (highest `q` first,
 * primary subtag only), e.g. `nl,en;q=0.8` → `['nl', 'en']`. Empty when absent,
 * letting the engine fall back to its own default order.
 */
function parseAcceptLanguage(header: string | null): string[] {
  if (header === null || header.length === 0) {
    return [];
  }
  return header
    .split(',')
    .map((part) => {
      const [tag, ...parameters] = part.trim().split(';');
      const quality = parameters
        .map((parameter) => parameter.trim())
        .find((parameter) => parameter.startsWith('q='));
      const weight = quality === undefined ? 1 : Number(quality.slice(2)) || 0;
      const primary = (tag ?? '').trim().split('-')[0] ?? '';
      return { tag: primary.toLowerCase(), weight };
    })
    .filter((entry) => entry.tag.length > 0 && entry.weight > 0)
    .sort((left, right) => right.weight - left.weight)
    .map((entry) => entry.tag);
}
