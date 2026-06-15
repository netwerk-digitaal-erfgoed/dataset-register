import { describe, expect, it } from 'vitest';
import { runSingleFlight, type CoalescingLock } from '../src/single-flight.ts';

/** In-memory lock double so the coalescing logic is tested deterministically. */
function fakeLock(overrides: Partial<CoalescingLock> = {}): {
  lock: CoalescingLock;
  marked: () => number;
} {
  let markedCount = 0;
  const lock: CoalescingLock = {
    acquire: async () => true,
    release: async () => undefined,
    markPending: async () => {
      markedCount += 1;
    },
    consumePending: async () => false,
    ...overrides,
  };
  return { lock, marked: () => markedCount };
}

describe('runSingleFlight', () => {
  it('runs the rebuild once when uncontended', async () => {
    let runs = 0;
    const { lock } = fakeLock();
    await runSingleFlight(lock, async () => {
      runs += 1;
    });
    expect(runs).toBe(1);
  });

  it('coalesces a trigger arriving during a rebuild into one follow-up', async () => {
    let runs = 0;
    const pending = [true, false];
    const { lock } = fakeLock({
      consumePending: async () => pending.shift() ?? false,
    });
    await runSingleFlight(lock, async () => {
      runs += 1;
    });
    expect(runs).toBe(2);
  });

  it('skips the rebuild and marks pending when the lock is held', async () => {
    let runs = 0;
    const { lock, marked } = fakeLock({ acquire: async () => false });
    await runSingleFlight(lock, async () => {
      runs += 1;
    });
    expect(runs).toBe(0);
    expect(marked()).toBe(1);
  });

  it('releases the lock even if the rebuild throws', async () => {
    let released = false;
    const { lock } = fakeLock({
      release: async () => {
        released = true;
      },
    });
    await expect(
      runSingleFlight(lock, async () => {
        throw new Error('rebuild failed');
      }),
    ).rejects.toThrow('rebuild failed');
    expect(released).toBe(true);
  });
});
