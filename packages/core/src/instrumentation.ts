import { metrics, ValueType } from '@opentelemetry/api';
import {
  defaultResource,
  resourceFromAttributes,
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
const meterProvider = new MeterProvider({
  resource: defaultResource().merge(
    resourceFromAttributes({ [ATTR_SERVICE_NAME]: 'dataset-register' }),
  ),
  readers: [
    new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(),
      exportIntervalMillis: 60000,
    }),
  ],
});

metrics.setGlobalMeterProvider(meterProvider);

/**
 * Flush pending metrics and stop the reader. The PeriodicExportingMetricReader
 * only exports every `exportIntervalMillis`, so a short-lived one-shot process
 * (e.g. the crawler CronJob) would exit before its final window is exported,
 * silently dropping counts. Await this before exit — and on SIGTERM, so a
 * watchdog-terminated pod still ships the metrics it managed to record.
 */
export async function shutdownInstrumentation(): Promise<void> {
  await meterProvider.shutdown();
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
