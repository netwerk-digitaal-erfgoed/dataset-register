import { envSchema, JSONSchemaType } from 'env-schema';

interface Env {
  SPARQL_URL: string;
  SPARQL_ACCESS_TOKEN: string;
  DOCS_URL: string;
  LOG: boolean;
  TRUST_PROXY: boolean;
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
  },
};

export const config = envSchema({
  schema,
  dotenv: true,
});
