import { envSchema, JSONSchemaType } from 'env-schema';

export interface IndexerEnv {
  SPARQL_URL: string;
  REGISTRATIONS_GRAPH?: string;
  TYPESENSE_HOST: string;
  TYPESENSE_PORT: number;
  TYPESENSE_PROTOCOL: string;
  TYPESENSE_API_KEY: string;
}

const schema: JSONSchemaType<IndexerEnv> = {
  type: 'object',
  required: ['SPARQL_URL', 'TYPESENSE_HOST', 'TYPESENSE_API_KEY'],
  properties: {
    SPARQL_URL: { type: 'string' },
    REGISTRATIONS_GRAPH: { type: 'string', nullable: true },
    TYPESENSE_HOST: { type: 'string' },
    TYPESENSE_PORT: { type: 'number', default: 8108 },
    TYPESENSE_PROTOCOL: { type: 'string', default: 'http' },
    TYPESENSE_API_KEY: { type: 'string' },
  },
};

export function loadConfig(): IndexerEnv {
  return envSchema({ schema, dotenv: true });
}
