import {
  diag,
  DiagConsoleLogger,
  type DiagLogger,
  metrics,
  ValueType,
} from '@opentelemetry/api';
import { diagLogLevelFromString, getStringFromEnv } from '@opentelemetry/core';
import {
  defaultResource,
  detectResources,
  envDetector,
  resourceFromAttributes,
  type Resource,
} from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import {
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import type { DatasetStore } from './dataset.ts';

export function startInstrumentation(datasetStore: DatasetStore) {
  datasetsCounter.addCallback(async (result) =>
    result.observe(await datasetStore.countDatasets()),
  );
  organisationsCounter.addCallback(async (result) =>
    result.observe(await datasetStore.countOrganisations()),
  );
}

/**
 * Build the metrics resource the way the OpenTelemetry NodeSDK does: start
 * from the SDK defaults and the application’s own service name, then let the
 * environment (`OTEL_SERVICE_NAME`, `OTEL_RESOURCE_ATTRIBUTES`) take
 * precedence. That is how the deployment tells replicas apart – it injects
 * `service.instance.id` and `k8s.pod.name` from the pod name – so two API pods
 * no longer export identical series that overwrite each other in the
 * collector. Only the env detector runs: the NodeSDK’s process and host
 * detectors would add per-restart attributes (`process.pid`, `host.id`), which
 * break series continuity just like a random instance id would.
 */
export function detectResource(): Resource {
  return defaultResource()
    .merge(resourceFromAttributes({ [ATTR_SERVICE_NAME]: 'dataset-register' }))
    .merge(detectResources({ detectors: [envDetector] }));
}

/**
 * Surface SDK diagnostics (failed exports, detected resources) when
 * `OTEL_LOG_LEVEL` is set, as the NodeSDK does. Without a registered logger
 * the SDK swallows export failures silently.
 */
export function configureDiagnosticLogging(
  logLevelName = getStringFromEnv('OTEL_LOG_LEVEL'),
  logger: DiagLogger = new DiagConsoleLogger(),
): void {
  const logLevel = diagLogLevelFromString(logLevelName);
  if (logLevel === undefined) {
    return;
  }
  diag.setLogger(logger, { logLevel });
}

configureDiagnosticLogging();

const meterProvider = new MeterProvider({
  resource: detectResource(),
  readers: [
    new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(),
      exportIntervalMillis: 60000,
    }),
  ],
});

metrics.setGlobalMeterProvider(meterProvider);

let shutdown: Promise<void> | undefined;

/**
 * Flush pending metrics and stop the reader, at most once. The
 * PeriodicExportingMetricReader only exports every `exportIntervalMillis`, so a
 * short-lived one-shot process (e.g. the crawler CronJob) would exit before its
 * final window is exported, silently dropping counts. Await this before exit –
 * and on SIGTERM, so a watchdog-terminated pod still ships the metrics it
 * managed to record.
 *
 * Memoized so a normal-exit flush and a concurrent SIGTERM flush share one
 * shutdown instead of calling `meterProvider.shutdown()` twice. Bounded by
 * `timeoutMillis` so a slow or unreachable OTLP collector can never delay
 * process exit past the pod's termination grace period; the underlying export
 * is best-effort and keeps running in the background if it loses the race.
 */
export function shutdownInstrumentation(timeoutMillis = 5000): Promise<void> {
  shutdown ??= Promise.race([
    meterProvider.shutdown(),
    new Promise<void>((resolve) => {
      setTimeout(resolve, timeoutMillis).unref();
    }),
  ]);
  return shutdown;
}

const meter = metrics.getMeter('default');

const datasetsCounter = meter.createObservableCounter('datasets.counter', {
  description: 'Number of datasets',
  valueType: ValueType.INT,
});

const organisationsCounter = meter.createObservableCounter(
  'organisations.counter',
  {
    description: 'Number of organisations',
    valueType: ValueType.INT,
  },
);

export const registrationsCounter = meter.createCounter(
  'registrations.counter',
  {
    description: 'Number of times a dataset/catalog was submitted',
    valueType: ValueType.INT,
  },
);

export const validationsCounter = meter.createCounter('validations.counter', {
  description: 'Number of times an dataset/catalog was validated',
  valueType: ValueType.INT,
});

export const crawlCounter = meter.createCounter('crawler.counter', {
  description: 'Number of times a dataset/catalog was crawled',
  valueType: ValueType.INT,
});
