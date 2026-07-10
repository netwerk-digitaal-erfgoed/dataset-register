import { describe, expect, it } from 'vitest';
import { shutdownInstrumentation } from '../src/instrumentation.js';

describe('shutdownInstrumentation', () => {
  it('flushes and stops the meter provider without throwing', async () => {
    // A one-shot process (the crawler CronJob) awaits this before exit to force a
    // final metrics export. It must resolve even with no OTLP collector reachable,
    // so a failed export never blocks or crashes shutdown.
    await expect(shutdownInstrumentation()).resolves.toBeUndefined();
  });
});
