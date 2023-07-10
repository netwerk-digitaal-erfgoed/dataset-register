import {metrics, ValueType} from '@opentelemetry/api';
import {Resource} from '@opentelemetry/resources';
import {SemanticResourceAttributes} from '@opentelemetry/semantic-conventions';
import {
  ConsoleMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import {OTLPMetricExporter} from '@opentelemetry/exporter-metrics-otlp-proto';

const meterProvider = new MeterProvider({
  resource: Resource.default().merge(
    new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: 'dataset-register',
    })
  ),
});

const metricReader = new PeriodicExportingMetricReader({
  exporter: new OTLPMetricExporter(),
  exportIntervalMillis: 3000,
});

meterProvider.addMetricReader(metricReader);
meterProvider.addMetricReader(
  new PeriodicExportingMetricReader({
    exporter: new ConsoleMetricExporter(),
    exportIntervalMillis: 3000,
  })
);
metrics.setGlobalMeterProvider(meterProvider);

const meter = metrics.getMeter('dataset-register');

export const datasetsCounter = meter.createObservableCounter('datasets.count', {
  description: 'Number of registered datasets',
  valueType: ValueType.INT,
});

export const registrationsCounter = meter.createUpDownCounter(
  'registrations.count',
  {
    description: 'Number of registration URLs',
    valueType: ValueType.INT,
  }
);
