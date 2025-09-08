import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import fetch from 'node-fetch';

/**
 * QLever testcontainer that provides a SPARQL endpoint for integration tests.
 * Based on the QLever Docker image with custom configuration for testing.
 */
export class QLeverContainer {
  public readonly accessToken = 'TEST_TOKEN_123';
  private container: StartedTestContainer | null = null;
  private readonly port = 7001;

  async start(): Promise<string> {
    this.container = await new GenericContainer('adfreiburg/qlever:latest')
      .withExposedPorts(this.port)
      .withEntrypoint(['/bin/sh'])
      .withCommand([
        '-c',
        `echo "" | /qlever/IndexBuilderMain --index-basename test -F nt -f - \
          && /qlever/ServerMain --index-basename test --port ${this.port} --access-token ${this.accessToken}`
      ])
      .start();

    return this.getSparqlEndpoint();
  }

  /**
   * Stop and remove the QLever container.
   */
  async stop(): Promise<void> {
    if (this.container) {
      await this.container.stop();
      this.container = null;
    }
  }

  /**
   * Get the SPARQL endpoint URL for the running container.
   */
  getSparqlEndpoint(): string {
    if (!this.container) {
      throw new Error('QLever container is not started');
    }

    const host = this.container.getHost();
    const mappedPort = this.container.getMappedPort(this.port);
    return `http://${host}:${mappedPort}`;
  }

  /**
   * Clear all data from the SPARQL endpoint by running a DELETE query.
   */
  async clearData(): Promise<void> {
    const response = await fetch(this.getSparqlEndpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/sparql-update',
        'Authorization': `Bearer ${this.accessToken}`,
      },
      body: 'CLEAR ALL',
    });

    if (!response.ok) {
      throw new Error(`Failed to clear QLever data: ${response.status} ${response.statusText}`);
    }
  }
}
