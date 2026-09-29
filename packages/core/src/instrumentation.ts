import { metrics, ValueType } from '@opentelemetry/api';
import {
  defaultResource,
  detectResources,
  envDetector,
  resourceFromAttributes,
} from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import {
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { hostname } from 'node:os';
import type { DatasetStore } from './dataset.ts';

export function startInstrumentation(datasetStore: DatasetStore) {
  datasetsGauge.addCallback(async (result) =>
    result.observe(await datasetStore.countDatasets()),
  );
  organisationsGauge.addCallback(async (result) =>
    result.observe(await datasetStore.countOrganisations()),
  );
}

// Incubating in @opentelemetry/semantic-conventions, which recommends copying such constants.
const ATTR_SERVICE_INSTANCE_ID = 'service.instance.id';

const meterProvider = new MeterProvider({
  // Each replica needs its own service.instance.id: without one, replicas write to the same
  // series and overwrite each other’s values. The hostname is the pod name in Kubernetes.
  // OTEL_SERVICE_NAME and OTEL_RESOURCE_ATTRIBUTES override these defaults.
  resource: defaultResource()
    .merge(
      resourceFromAttributes({
        [ATTR_SERVICE_NAME]: 'dataset-register',
        [ATTR_SERVICE_INSTANCE_ID]: hostname(),
      }),
    )
    .merge(detectResources({ detectors: [envDetector] })),
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

// Gauges, not counters: these are store totals that can go down, and every replica reports
// the same total, so aggregate them with max rather than sum.
const datasetsGauge = meter.createObservableGauge('datasets', {
  description: 'Number of datasets',
  valueType: ValueType.INT,
});

const organisationsGauge = meter.createObservableGauge('organisations', {
  description: 'Number of organisations',
  valueType: ValueType.INT,
});

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
