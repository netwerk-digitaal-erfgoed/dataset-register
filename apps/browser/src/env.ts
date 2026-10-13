import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
  PUBLIC_SPARQL_ENDPOINT: { public: true, static: true },
  PUBLIC_KNOWLEDGE_GRAPH_ENDPOINT: { public: true, static: true },
  PUBLIC_API_ENDPOINT: { public: true, static: true },
  // Optional: the search client falls back to the same-origin `/graphql` route.
  PUBLIC_SEARCH_GRAPHQL_ENDPOINT: {
    public: true,
    schema: (input) => input ?? '',
  },
});
