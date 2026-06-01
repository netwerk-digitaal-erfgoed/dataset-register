import { envSchema, JSONSchemaType } from 'env-schema';

interface Env {
  SPARQL_URL: string;
  SPARQL_ACCESS_TOKEN: string;
  REGISTRATION_URL_TTL: number;
  CRAWLER_SCHEDULE?: string;
  HTTP_REQUEST_TIMEOUT: number;
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
  },
};

export const config = envSchema({
  schema,
  dotenv: true,
});
