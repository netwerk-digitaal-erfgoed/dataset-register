/**
 * The coordination primitive {@link runSingleFlight} needs: a cross-pod mutex
 * plus a one-slot "another trigger arrived" flag. {@link RebuildLock} implements
 * it on Typesense; tests substitute an in-memory double.
 */
export interface CoalescingLock {
  /** Try to take the lock; true on success, false if another holder has it. */
  acquire(): Promise<boolean>;
  /** Release the lock. */
  release(): Promise<void>;
  /** Record that a rebuild was requested while the lock was held. */
  markPending(): Promise<void>;
  /** Read and clear the pending flag, returning whether it was set. */
  consumePending(): Promise<boolean>;
}

/**
 * Run `rebuild` under a cross-pod single-flight guard. At most one rebuild runs
 * at a time across all pods; a trigger that arrives while a rebuild is in flight
 * is coalesced into exactly one follow-up rebuild (so the latest canonical state
 * — including a just-issued delete — is always reflected) rather than running a
 * redundant concurrent rebuild or being dropped.
 */
export async function runSingleFlight(
  lock: CoalescingLock,
  rebuild: () => Promise<void>,
): Promise<void> {
  if (!(await lock.acquire())) {
    // Another pod is rebuilding; ask it to run once more after it finishes.
    await lock.markPending();
    return;
  }
  try {
    do {
      await rebuild();
    } while (await lock.consumePending());
  } finally {
    await lock.release();
  }
}
