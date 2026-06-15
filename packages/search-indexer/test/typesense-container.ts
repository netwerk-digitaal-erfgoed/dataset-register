import {
  GenericContainer,
  Wait,
  type StartedTestContainer,
} from 'testcontainers';
import type { TypesenseConnection } from '@lde/typesense';

/**
 * Single-node Typesense server. Pinned to v30: Dutch Snowball stemming (v28 only
 * stems English) plus the Synonym Sets API the indexer uses (the per-collection
 * synonyms API was removed in v30).
 */
export class TypesenseContainer {
  public readonly apiKey = 'test-api-key';
  private container: StartedTestContainer | null = null;
  private readonly port = 8108;

  async start(): Promise<TypesenseConnection> {
    this.container = await new GenericContainer('typesense/typesense:30.0')
      .withExposedPorts(this.port)
      .withCommand([
        '--data-dir=/tmp',
        `--api-key=${this.apiKey}`,
        '--enable-cors',
      ])
      .withWaitStrategy(Wait.forHttp('/health', this.port).forStatusCode(200))
      .start();
    return this.connection();
  }

  connection(): TypesenseConnection {
    if (!this.container) {
      throw new Error('Typesense container is not started');
    }
    return {
      host: this.container.getHost(),
      port: this.container.getMappedPort(this.port),
      protocol: 'http',
      apiKey: this.apiKey,
    };
  }

  async stop(): Promise<void> {
    if (this.container) {
      await this.container.stop();
      this.container = null;
    }
  }
}
