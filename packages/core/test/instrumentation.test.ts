import { describe, expect, it } from 'vitest';
import { shutdownInstrumentation } from '../src/instrumentation.js';

describe('shutdownInstrumentation', () => {
  it('flushes at most once and resolves without throwing', async () => {
    // A one-shot process (the crawler CronJob) awaits this before exit to force a
    // final metrics export. It must resolve even with no OTLP collector reachable,
    // so a failed export never blocks or crashes shutdown.
    const first = shutdownInstrumentation();

    // Memoized: a concurrent SIGTERM flush reuses the same shutdown instead of
    // calling meterProvider.shutdown() a second time.
    expect(shutdownInstrumentation()).toBe(first);

    await expect(first).resolves.toBeUndefined();
  });
});
