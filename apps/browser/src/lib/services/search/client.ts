import { env } from '$env/dynamic/public';

/** One GraphQL error entry from the endpoint’s `errors` array. */
interface GraphQLError {
  readonly message: string;
}

/**
 * The GraphQL search endpoint the browser posts to. Defaults to the same-origin
 * `/graphql` route (no CORS, resolvable server-side via `event.fetch`); a
 * deployment can point it at the dedicated search subdomain instead.
 */
function endpoint(): string {
  return env.PUBLIC_SEARCH_GRAPHQL_ENDPOINT || '/graphql';
}

/**
 * POST a GraphQL query to the search endpoint and return its `data`.
 *
 * The Typesense engine runs behind this endpoint (server-side), so the browser
 * no longer talks to Typesense directly and no search key is shipped to the
 * client. `fetchImpl` is injected so a server-side caller (the RSS feed) can pass
 * SvelteKit’s `event.fetch`, which resolves the same-origin relative URL; the
 * browser uses the global `fetch`. The active UI locale rides in as
 * `Accept-Language` so the API serves labels and text in that language.
 */
export async function queryGraphQL<T>(
  query: string,
  variables: Record<string, unknown>,
  options: { readonly locale: string; readonly fetchImpl?: typeof fetch },
): Promise<T> {
  const doFetch = options.fetchImpl ?? fetch;
  const response = await doFetch(endpoint(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept-Language': options.locale,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) {
    throw new Error(
      `GraphQL search request failed (${response.status}): ${await response.text()}`,
    );
  }
  const result = (await response.json()) as {
    data?: T;
    errors?: readonly GraphQLError[];
  };
  if (result.errors !== undefined && result.errors.length > 0) {
    throw new Error(
      `GraphQL search errors: ${result.errors.map((graphqlError) => graphqlError.message).join('; ')}`,
    );
  }
  if (result.data === undefined || result.data === null) {
    throw new Error('GraphQL search response contained no data.');
  }
  return result.data;
}
