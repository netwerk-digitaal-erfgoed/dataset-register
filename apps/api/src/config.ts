import { envSchema, JSONSchemaType } from 'env-schema';

interface Env {
  SPARQL_URL: string;
  SPARQL_ACCESS_TOKEN: string;
  API_ACCESS_TOKEN?: string;
  DOCS_URL: string;
  LOG: boolean;
  TRUST_PROXY: boolean;
  // Optional Typesense target. When host + API key are set, deleting a
  // registration triggers a search-index rebuild (fire-and-forget). Absent →
  // no indexing, so the API runs unchanged without a Typesense deployment.
  TYPESENSE_HOST?: string;
  TYPESENSE_PORT: number;
  TYPESENSE_PROTOCOL: string;
  TYPESENSE_API_KEY?: string;
  // Optional Dataset Knowledge Graph SPARQL endpoint enriching the rebuild with
  // DKG facets; absent → register-only index, no enrichment.
  KNOWLEDGE_GRAPH_URL?: string;
}

const schema: JSONSchemaType<Env> = {
  type: 'object',
  required: [],
  properties: {
    SPARQL_URL: {
      type: 'string',
    },
    SPARQL_ACCESS_TOKEN: {
      type: 'string',
    },
    API_ACCESS_TOKEN: {
      type: 'string',
      nullable: true,
    },
    DOCS_URL: {
      type: 'string',
      default: '/',
    },
    LOG: {
      type: 'boolean',
      default: true,
    },
    TRUST_PROXY: {
      type: 'boolean',
      default: false,
    },
    TYPESENSE_HOST: {
      type: 'string',
      nullable: true,
    },
    TYPESENSE_PORT: {
      type: 'number',
      default: 8108,
    },
    TYPESENSE_PROTOCOL: {
      type: 'string',
      default: 'http',
    },
    TYPESENSE_API_KEY: {
      type: 'string',
      nullable: true,
    },
    KNOWLEDGE_GRAPH_URL: {
      type: 'string',
      nullable: true,
    },
  },
};

export const config = envSchema({
  schema,
  dotenv: true,
});
