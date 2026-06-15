import { envSchema, JSONSchemaType } from 'env-schema';

interface Env {
  SPARQL_URL: string;
  SPARQL_ACCESS_TOKEN: string;
  REGISTRATION_URL_TTL: number;
  CRAWLER_SCHEDULE?: string;
  HTTP_REQUEST_TIMEOUT: number;
  CRAWLER_MAX_DISTRIBUTION_PROBES: number;
  // Optional Typesense target. When host + API key are set, the crawler triggers
  // a search-index run after each crawl (fire-and-forget). Absent → no indexing,
  // so the crawler runs unchanged without a Typesense deployment.
  TYPESENSE_HOST?: string;
  TYPESENSE_PORT: number;
  TYPESENSE_PROTOCOL: string;
  TYPESENSE_API_KEY?: string;
  // Optional Dataset Knowledge Graph SPARQL endpoint. When set, each rebuild
  // enriches the index with DKG facets (class, terminology_source, size); absent
  // → register-only index, no enrichment.
  KNOWLEDGE_GRAPH_URL?: string;
}

const schema: JSONSchemaType<Env> = {
  type: 'object',
  required: ['SPARQL_URL'],
  properties: {
    SPARQL_URL: {
      type: 'string',
    },
    SPARQL_ACCESS_TOKEN: {
      type: 'string',
    },
    REGISTRATION_URL_TTL: {
      type: 'number',
      default: 86400,
    },
    CRAWLER_SCHEDULE: {
      type: 'string',
      nullable: true,
    },
    HTTP_REQUEST_TIMEOUT: {
      type: 'number',
      // At least 1 second: 0 would abort every request immediately (indexing
      // nothing) and a negative value throws when used as an AbortSignal delay.
      minimum: 1,
      default: 30,
    },
    CRAWLER_MAX_DISTRIBUTION_PROBES: {
      type: 'number',
      // At least 1: 0 would skip every probe and a negative value makes the
      // slice drop endpoints from the end instead of capping.
      minimum: 1,
      default: 100,
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
