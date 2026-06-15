import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'typesense';
import { createTypesenseClient } from '@lde/typesense';
import { RebuildLock } from '../src/rebuild-lock.ts';
import { TypesenseContainer } from './typesense-container.ts';

describe('RebuildLock (Typesense)', () => {
  const typesense = new TypesenseContainer();
  let client: Client;

  beforeAll(async () => {
    client = createTypesenseClient(await typesense.start());
  }, 120_000);

  afterAll(async () => {
    await typesense.stop();
  });

  afterEach(async () => {
    await new RebuildLock(client).release();
  });

  it('grants the lock once and refuses a concurrent acquirer', async () => {
    expect(await new RebuildLock(client).acquire()).toBe(true);
    expect(await new RebuildLock(client).acquire()).toBe(false);
  });

  it('reclaims a lock older than the TTL (crashed holder)', async () => {
    // Ensure the lock collection exists, then plant a stale held lock.
    const seed = new RebuildLock(client);
    await seed.acquire();
    await seed.release();
    await client
      .collections('rebuild_locks')
      .documents()
      .upsert({ id: 'dataset-rebuild', acquired_at: Date.now() - 60_000 });

    expect(await new RebuildLock(client, 1_000).acquire()).toBe(true);
  });

  it('records a pending follow-up and consumes it once', async () => {
    const holder = new RebuildLock(client);
    expect(await holder.acquire()).toBe(true);

    // A contender that cannot acquire asks the holder to run once more.
    const contender = new RebuildLock(client);
    expect(await contender.acquire()).toBe(false);
    await contender.markPending();

    expect(await holder.consumePending()).toBe(true);
    expect(await holder.consumePending()).toBe(false);
  });

  it('reports no pending follow-up when the lock is not held', async () => {
    expect(await new RebuildLock(client).consumePending()).toBe(false);
  });

  it('marking pending is a no-op when the lock is not held', async () => {
    await expect(
      new RebuildLock(client).markPending(),
    ).resolves.toBeUndefined();
  });
});
