import { GenericContainer, type StartedTestContainer } from 'testcontainers';

/**
 * QLever testcontainer providing a SPARQL endpoint, mirroring the helper in
 * @dataset-register/core (which is not exported from the package). Pinned to the
 * same commit to avoid the ARM64 “Illegal instruction” crash in later builds.
 */
export class QLeverContainer {
  public readonly accessToken = 'TEST_TOKEN_123';
  private container: StartedTestContainer | null = null;
  private readonly port = 7001;

  async start(): Promise<string> {
    this.container = await new GenericContainer(
      'adfreiburg/qlever:commit-dbce463',
    )
      .withExposedPorts(this.port)
      .withEntrypoint(['/bin/sh'])
      .withCommand([
        '-c',
        `echo "" | /qlever/IndexBuilderMain --index-basename test -F nt -f - \
          && /qlever/ServerMain --index-basename test --port ${this.port} --access-token ${this.accessToken}`,
      ])
      .start();
    return this.getSparqlEndpoint();
  }

  getSparqlEndpoint(): string {
    if (!this.container) {
      throw new Error('QLever container is not started');
    }
    return `http://${this.container.getHost()}:${this.container.getMappedPort(this.port)}`;
  }

  async stop(): Promise<void> {
    if (this.container) {
      await this.container.stop();
      this.container = null;
    }
  }
}
