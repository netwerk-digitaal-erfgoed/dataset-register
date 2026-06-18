import { Client } from 'typesense';

/** A flat Typesense connection config, mapped to a single-node {@link Client}. */
export interface TypesenseConnection {
  readonly host: string;
  readonly port: number;
  /** `http` or `https`. */
  readonly protocol: string;
  readonly apiKey: string;
  readonly connectionTimeoutSeconds?: number;
}

/**
 * Build a single-node Typesense {@link Client} from a flat connection config.
 * The blue/green rebuild and its cross-pod lock now live in `@lde/search-typesense`’s
 * `rebuild`, which takes a {@link Client}; this is the one place the indexer turns
 * its environment config into that client.
 */
export function createTypesenseClient(connection: TypesenseConnection): Client {
  return new Client({
    nodes: [
      {
        host: connection.host,
        port: connection.port,
        protocol: connection.protocol,
      },
    ],
    apiKey: connection.apiKey,
    connectionTimeoutSeconds: connection.connectionTimeoutSeconds ?? 5,
  });
}
