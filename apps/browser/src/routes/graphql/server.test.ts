import { beforeAll, describe, expect, it } from 'vitest';
import { GET, POST } from './+server';

/**
 * The endpoint is exercised for real rather than against a mocked handler: the
 * bug this guards against lives in the boundary between graphql-yoga's
 * ponyfilled `Response` and the platform one, which only a real handler
 * reproduces. Neither request below reaches Typesense – `?sdl` prints the
 * schema and the playground is static – so a dummy connection suffices.
 */
beforeAll(() => {
  process.env.TYPESENSE_HOST ??= 'localhost';
  process.env.TYPESENSE_API_KEY ??= 'test';
});

/** SvelteKit checks an endpoint result with `instanceof Response` against the
 *  global; anything else fails the route with a 500 at runtime, which no
 *  type-level check catches. */
function expectPlatformResponse(
  response: unknown,
): asserts response is Response {
  expect(response).toBeInstanceOf(Response);
}

describe('/graphql', () => {
  it('answers a query with a platform Response', async () => {
    const response = await POST({
      request: new Request('http://localhost/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{__typename}' }),
      }),
    } as Parameters<typeof POST>[0]);

    expectPlatformResponse(response);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { __typename: 'Query' },
    });
  });

  it('accepts the group tokens the sidebar filters by', async () => {
    // `class` is an IRIFilter since @lde/search 0.21, so its values coerce
    // against the IRI scalar — but the class facet deliberately carries
    // `group:*` tokens beside real class IRIs, and `format` carries them beside
    // bare media types. A scalar that rejected them would fail every grouped
    // facet selection at coercion, before Typesense is ever reached, which is
    // why this asserts on coercion rather than on results.
    const response = await POST({
      request: new Request('http://localhost/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `query ($where: DatasetWhere) {
            datasets(where: $where, perPage: 0) { pagination { total } }
          }`,
          variables: {
            where: {
              class: { in: ['group:person', 'https://schema.org/Person'] },
              format: { in: ['group:rdf', 'application/ld+json'] },
            },
          },
        }),
      }),
    } as Parameters<typeof POST>[0]);

    expectPlatformResponse(response);
    const body = (await response.json()) as {
      errors?: readonly { readonly message: string }[];
    };
    // Typesense is a dummy host here, so a resolver error is expected and fine;
    // what must not appear is a coercion failure on the values themselves.
    const coercion = (body.errors ?? []).filter((error) =>
      /IRI|expected type|cannot represent/i.test(error.message),
    );
    expect(coercion).toEqual([]);
  });

  it('serves the SDL as a platform Response', async () => {
    const response = await GET({
      request: new Request('http://localhost/graphql?sdl'),
    } as Parameters<typeof GET>[0]);

    expectPlatformResponse(response);
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain('type Query {');
  });

  it('serves the playground as a platform Response', async () => {
    const response = await GET({
      request: new Request('http://localhost/graphql', {
        headers: { Accept: 'text/html' },
      }),
    } as Parameters<typeof GET>[0]);

    expectPlatformResponse(response);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
  });
});
