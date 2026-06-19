import { envSchema, JSONSchemaType } from 'env-schema';

export interface IndexerEnv {
  SPARQL_URL: string;
  REGISTRATIONS_GRAPH?: string;
  // Dataset Knowledge Graph SPARQL endpoint enriching the rebuild with DKG
  // facets. Defaults to the public NDE endpoint, like the crawler and API.
  KNOWLEDGE_GRAPH_URL: string;
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
    KNOWLEDGE_GRAPH_URL: {
      type: 'string',
      default:
        'https://sparql.netwerkdigitaalerfgoed.nl/dataset-knowledge-graph',
    },
    TYPESENSE_HOST: { type: 'string' },
    TYPESENSE_PORT: { type: 'number', default: 8108 },
    TYPESENSE_PROTOCOL: { type: 'string', default: 'http' },
    TYPESENSE_API_KEY: { type: 'string' },
  },
};

export function loadConfig(): IndexerEnv {
  return envSchema({ schema, dotenv: true });
}
