import rdf from 'rdf-ext';
import type DatasetExt from 'rdf-ext/lib/Dataset.js';
import { Registration } from '../../src/registration.js';

export function createTestDataset(
  datasetIri: string,
  title?: string,
): DatasetExt {
  const dataset = rdf.dataset();
  const subject = rdf.namedNode(datasetIri);

  dataset.add(
    rdf.quad(
      subject,
      rdf.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
      rdf.namedNode('http://www.w3.org/ns/dcat#Dataset'),
    ),
  );

  if (title) {
    dataset.add(
      rdf.quad(
        subject,
        rdf.namedNode('http://purl.org/dc/terms/title'),
        rdf.literal(title, 'en'),
      ),
    );
  }

  return dataset;
}

export function createTestDatasetWithPublisher(
  datasetIri: string,
  publisherIri: string,
  publisherName: string,
): DatasetExt {
  const dataset = createTestDataset(datasetIri);
  const publisher = rdf.namedNode(publisherIri);

  dataset.add(
    rdf.quad(
      rdf.namedNode(datasetIri),
      rdf.namedNode('http://purl.org/dc/terms/publisher'),
      publisher,
    ),
  );

  dataset.add(
    rdf.quad(
      publisher,
      rdf.namedNode('http://www.w3.org/2000/01/rdf-schema#label'),
      rdf.literal(publisherName, 'en'),
    ),
  );

  return dataset;
}

export function createTestRegistration(
  url: string,
  datePosted?: Date,
  validUntil?: Date,
  dateRead?: Date,
  datasets: URL[] = [],
): Registration {
  const registration = new Registration(
    new URL(url),
    datePosted || new Date('2025-01-01T00:00:00Z'),
    validUntil,
  );

  if (dateRead) {
    return registration.read(datasets, 200, false, dateRead);
  }

  return registration;
}

export const TEST_DATASET_IRIS = {
  DATASET_1: 'http://example.org/dataset/1',
  DATASET_2: 'http://example.org/dataset/2',
  DATASET_3: 'http://example.org/dataset/3',
} as const;

export const TEST_PUBLISHER_IRIS = {
  PUBLISHER_1: 'http://example.org/publisher/1',
  PUBLISHER_2: 'http://example.org/publisher/2',
} as const;
