import { Client } from 'typesense';
import type { CoalescingLock } from './single-flight.js';

const LOCK_COLLECTION = 'rebuild_locks';
const LOCK_ID = 'dataset-rebuild';

/** A held lock older than this is treated as abandoned (crashed holder). */
const DEFAULT_TTL_MS = 10 * 60 * 1000;

/**
 * A cross-pod single-flight guard for the search rebuild, built on Typesense as
 * the shared coordination substrate. Creating the lock document with the
 * `create` action is an atomic test-and-set — Typesense rejects a second create
 * of the same id — so only one rebuilder across all replicas (the crawler pod
 * and every API pod) proceeds at a time. A lock older than the TTL is reclaimed
 * so a crashed holder cannot wedge rebuilds forever.
 */
export class RebuildLock implements CoalescingLock {
  constructor(
    private readonly client: Client,
    private readonly ttlMs: number = DEFAULT_TTL_MS,
  ) {}

  /** Try to take the lock. Returns true on success, false if held by another. */
  async acquire(): Promise<boolean> {
    await this.ensureCollection();
    try {
      await this.documents().create({ id: LOCK_ID, acquired_at: Date.now() });
      return true;
    } catch (error) {
      if (httpStatus(error) === 409) {
        return this.reclaimIfStale();
      }
      throw error;
    }
  }

  /** Take over the lock if its holder has not refreshed it within the TTL. */
  private async reclaimIfStale(): Promise<boolean> {
    let held: { acquired_at: number };
    try {
      held = (await this.client
        .collections(LOCK_COLLECTION)
        .documents(LOCK_ID)
        .retrieve()) as { acquired_at: number };
    } catch (error) {
      // Released between our create and this read — leave it for the next try.
      if (httpStatus(error) === 404) {
        return false;
      }
      throw error;
    }
    if (Date.now() - held.acquired_at <= this.ttlMs) {
      return false;
    }
    await this.documents().upsert({ id: LOCK_ID, acquired_at: Date.now() });
    return true;
  }

  /** Release the lock; a no-op when it is not currently held. */
  async release(): Promise<void> {
    try {
      await this.client
        .collections(LOCK_COLLECTION)
        .documents(LOCK_ID)
        .delete();
    } catch (error) {
      if (httpStatus(error) !== 404) {
        throw error;
      }
    }
  }

  /** Flag that a rebuild was requested while the lock was held. */
  async markPending(): Promise<void> {
    try {
      await this.client
        .collections(LOCK_COLLECTION)
        .documents(LOCK_ID)
        .update({ pending: true });
    } catch (error) {
      // Holder released before we could mark — no follow-up needed.
      if (httpStatus(error) !== 404) {
        throw error;
      }
    }
  }

  /** Read and clear the pending flag, returning whether a follow-up is due. */
  async consumePending(): Promise<boolean> {
    let held: { pending?: boolean };
    try {
      held = (await this.client
        .collections(LOCK_COLLECTION)
        .documents(LOCK_ID)
        .retrieve()) as { pending?: boolean };
    } catch (error) {
      if (httpStatus(error) === 404) {
        return false;
      }
      throw error;
    }
    if (held.pending !== true) {
      return false;
    }
    await this.client
      .collections(LOCK_COLLECTION)
      .documents(LOCK_ID)
      .update({ pending: false });
    return true;
  }

  private documents() {
    return this.client.collections(LOCK_COLLECTION).documents();
  }

  private async ensureCollection(): Promise<void> {
    try {
      await this.client.collections(LOCK_COLLECTION).retrieve();
      return;
    } catch (error) {
      if (httpStatus(error) !== 404) {
        throw error;
      }
    }
    try {
      await this.client.collections().create({
        name: LOCK_COLLECTION,
        fields: [
          { name: 'acquired_at', type: 'int64' },
          { name: 'pending', type: 'bool', optional: true },
        ],
      });
    } catch (error) {
      // A concurrent acquirer may have created it first.
      if (httpStatus(error) !== 409) {
        throw error;
      }
    }
  }
}

function httpStatus(error: unknown): number | undefined {
  return (error as { httpStatus?: number }).httpStatus;
}
