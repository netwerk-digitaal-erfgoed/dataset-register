import { diag } from '@opentelemetry/api';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  configureDiagnosticLogging,
  detectResource,
  shutdownInstrumentation,
} from '../src/instrumentation.js';

describe('detectResource', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('names the service and keeps the SDK defaults', () => {
    vi.stubEnv('OTEL_SERVICE_NAME', undefined);
    vi.stubEnv('OTEL_RESOURCE_ATTRIBUTES', undefined);

    const attributes = detectResource().attributes;

    expect(attributes['service.name']).toBe('dataset-register');
    expect(attributes['telemetry.sdk.name']).toBe('opentelemetry');
    expect(attributes).not.toHaveProperty('service.instance.id');
  });

  it('honours OTEL_RESOURCE_ATTRIBUTES so the deployment can tell replicas apart', () => {
    // On SURF the manifests inject the pod name through the Downward API; the
    // app must not invent an instance id itself (a random UUID per process
    // would break series continuity on every restart).
    vi.stubEnv(
      'OTEL_RESOURCE_ATTRIBUTES',
      'service.instance.id=api-7d9f-abc12,k8s.pod.name=api-7d9f-abc12',
    );

    const attributes = detectResource().attributes;

    expect(attributes['service.instance.id']).toBe('api-7d9f-abc12');
    expect(attributes['k8s.pod.name']).toBe('api-7d9f-abc12');
    expect(attributes['service.name']).toBe('dataset-register');
  });

  it('lets OTEL_SERVICE_NAME override the built-in service name', () => {
    // Same precedence as the OpenTelemetry NodeSDK: environment beats code.
    vi.stubEnv('OTEL_SERVICE_NAME', 'dataset-register-staging');

    expect(detectResource().attributes['service.name']).toBe(
      'dataset-register-staging',
    );
  });
});

describe('configureDiagnosticLogging', () => {
  function fakeLogger() {
    return {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      verbose: vi.fn(),
    };
  }

  afterEach(() => {
    diag.disable();
  });

  it('routes SDK diagnostics at OTEL_LOG_LEVEL and above to the logger', () => {
    // Without a registered logger, failed metric exports are silently dropped,
    // which is how the 404s from the collector went unnoticed.
    const logger = fakeLogger();

    configureDiagnosticLogging('warn', logger);
    diag.error('export failed');
    diag.info('EnvDetector found resource.');

    expect(logger.error).toHaveBeenCalledWith('export failed');
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('leaves diagnostics off when OTEL_LOG_LEVEL is unset', () => {
    const logger = fakeLogger();

    configureDiagnosticLogging(undefined, logger);
    diag.error('export failed');

    expect(logger.error).not.toHaveBeenCalled();
  });
});

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
