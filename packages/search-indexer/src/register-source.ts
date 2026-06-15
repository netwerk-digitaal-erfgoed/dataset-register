import type { SparqlClient } from '@dataset-register/core';
import type { TypesenseDocument } from '@lde/typesense';
import {
  buildDocument,
  type LangValue,
  type RawDataset,
} from './projection.js';

const PREFIXES = `
  PREFIX schema: <https://schema.org/>
  PREFIX dcat: <http://www.w3.org/ns/dcat#>
  PREFIX dct: <http://purl.org/dc/terms/>
  PREFIX foaf: <http://xmlns.com/foaf/0.1/>
  PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
`;

/** Datasets per VALUES batch — keeps each query small for QLever. */
const BATCH_SIZE = 150;

interface RegistrationFields {
  dateReadIso?: string;
  datePostedIso?: string;
  validUntilIso?: string;
  additionalTypes: string[];
}

interface DatasetFields {
  titles: LangValue[];
  descriptions: LangValue[];
  publisherNames: LangValue[];
  creatorNames: LangValue[];
  keywords: LangValue[];
  languages: string[];
  publisherIris: string[];
  mediaTypes: string[];
  conformsTo: string[];
}

/**
 * Reads the register store (QLever) and projects datasets into Typesense
 * documents. Fully decoupled from the crawl write path: it only reads the
 * canonical RDF. Multi-valued properties are fetched with UNION branches (one
 * value variable per branch) to avoid the OPTIONAL cross-product that would
 * multiply languages × keywords × media types.
 */
export class RegisterSource {
  constructor(
    private readonly client: SparqlClient,
    private readonly registrationsGraphIri: string,
  ) {}

  /** Every registered dataset IRI (cheap — drives `last_seen` stamping). */
  async enumerateDatasetIris(): Promise<string[]> {
    const stream = await this.client.query(`
      ${PREFIXES}
      SELECT DISTINCT ?dataset WHERE {
        GRAPH <${this.registrationsGraphIri}> {
          ?registration a schema:EntryPoint ; schema:about ?dataset .
        }
      }`);
    return (await stream.toArray())
      .map((binding) => binding.get('dataset')?.value)
      .filter((iri): iri is string => iri !== undefined);
  }

  /** Project the given datasets into Typesense documents. */
  async project(iris: readonly string[]): Promise<TypesenseDocument[]> {
    const documents: TypesenseDocument[] = [];
    for (let offset = 0; offset < iris.length; offset += BATCH_SIZE) {
      const batch = iris.slice(offset, offset + BATCH_SIZE);
      const registrationFields = await this.fetchRegistrationFields(batch);
      const datasetFields = await this.fetchDatasetFields(batch);
      for (const iri of batch) {
        const dataset = datasetFields.get(iri);
        if (dataset === undefined) {
          continue; // No dataset graph (e.g. unreachable registration) — skip.
        }
        const registration = registrationFields.get(iri);
        documents.push(buildDocument(toRaw(iri, dataset, registration)));
      }
    }
    return documents;
  }

  private async fetchRegistrationFields(
    iris: readonly string[],
  ): Promise<Map<string, RegistrationFields>> {
    const stream = await this.client.query(`
      ${PREFIXES}
      SELECT ?dataset ?dateRead ?datePosted ?validUntil ?additionalType WHERE {
        GRAPH <${this.registrationsGraphIri}> {
          ?registration a schema:EntryPoint ;
            schema:about ?dataset ;
            schema:dateRead ?dateRead .
          OPTIONAL { ?registration schema:datePosted ?datePosted }
          OPTIONAL { ?registration schema:validUntil ?validUntil }
          OPTIONAL { ?registration schema:additionalType ?additionalType }
        }
        VALUES ?dataset { ${valuesList(iris)} }
      }`);

    const byDataset = new Map<string, RegistrationFields>();
    for (const binding of await stream.toArray()) {
      const iri = binding.get('dataset')?.value;
      if (iri === undefined) {
        continue;
      }
      const fields =
        byDataset.get(iri) ??
        ({ additionalTypes: [] } satisfies RegistrationFields);
      const dateRead = binding.get('dateRead')?.value;
      // Keep the most recent registration read when a dataset has several.
      if (dateRead !== undefined && isNewer(dateRead, fields.dateReadIso)) {
        fields.dateReadIso = dateRead;
        fields.datePostedIso = binding.get('datePosted')?.value;
        fields.validUntilIso = binding.get('validUntil')?.value;
      }
      const additionalType = binding.get('additionalType')?.value;
      if (additionalType !== undefined) {
        fields.additionalTypes.push(additionalType);
      }
      byDataset.set(iri, fields);
    }
    return byDataset;
  }

  private async fetchDatasetFields(
    iris: readonly string[],
  ): Promise<Map<string, DatasetFields>> {
    const stream = await this.client.query(`
      ${PREFIXES}
      SELECT ?dataset ?field ?value ?lang WHERE {
        VALUES ?dataset { ${valuesList(iris)} }
        GRAPH ?dataset {
          {
            ?dataset dct:title ?value .
            BIND("title" AS ?field) BIND(LANG(?value) AS ?lang)
          } UNION {
            ?dataset dct:description ?value .
            BIND("description" AS ?field) BIND(LANG(?value) AS ?lang)
          } UNION {
            ?dataset dct:publisher/foaf:name ?value .
            BIND("publisherName" AS ?field) BIND(LANG(?value) AS ?lang)
          } UNION {
            ?dataset dct:publisher ?publisher .
            FILTER(isIRI(?publisher))
            BIND(STR(?publisher) AS ?value) BIND("publisherIri" AS ?field)
          } UNION {
            ?dataset dct:creator/foaf:name ?value .
            BIND("creatorName" AS ?field) BIND(LANG(?value) AS ?lang)
          } UNION {
            ?dataset dcat:keyword ?value .
            BIND("keyword" AS ?field) BIND(LANG(?value) AS ?lang)
          } UNION {
            ?dataset dct:language ?language .
            BIND(STR(?language) AS ?value) BIND("language" AS ?field)
          } UNION {
            ?dataset dcat:distribution/dcat:mediaType ?mediaType .
            BIND(STR(?mediaType) AS ?value) BIND("mediaType" AS ?field)
          } UNION {
            ?dataset dcat:distribution/dct:conformsTo ?conformsTo .
            BIND(STR(?conformsTo) AS ?value) BIND("conformsTo" AS ?field)
          }
        }
      }`);

    const byDataset = new Map<string, DatasetFields>();
    for (const binding of await stream.toArray()) {
      const iri = binding.get('dataset')?.value;
      const field = binding.get('field')?.value;
      const value = binding.get('value')?.value;
      if (iri === undefined || field === undefined || value === undefined) {
        continue;
      }
      const fields = byDataset.get(iri) ?? emptyDatasetFields();
      const lang = binding.get('lang')?.value ?? '';
      addField(fields, field, value, lang);
      byDataset.set(iri, fields);
    }
    return byDataset;
  }
}

function toRaw(
  iri: string,
  dataset: DatasetFields,
  registration: RegistrationFields | undefined,
): RawDataset {
  return {
    iri,
    ...dataset,
    additionalTypes: registration?.additionalTypes ?? [],
    dateReadIso: registration?.dateReadIso,
    datePostedIso: registration?.datePostedIso,
    validUntilIso: registration?.validUntilIso,
  };
}

function addField(
  fields: DatasetFields,
  field: string,
  value: string,
  lang: string,
): void {
  switch (field) {
    case 'title':
      fields.titles.push({ value, lang });
      break;
    case 'description':
      fields.descriptions.push({ value, lang });
      break;
    case 'publisherName':
      fields.publisherNames.push({ value, lang });
      break;
    case 'creatorName':
      fields.creatorNames.push({ value, lang });
      break;
    case 'keyword':
      fields.keywords.push({ value, lang });
      break;
    case 'language':
      fields.languages.push(value);
      break;
    case 'publisherIri':
      fields.publisherIris.push(value);
      break;
    case 'mediaType':
      fields.mediaTypes.push(value);
      break;
    case 'conformsTo':
      fields.conformsTo.push(value);
      break;
  }
}

function emptyDatasetFields(): DatasetFields {
  return {
    titles: [],
    descriptions: [],
    publisherNames: [],
    creatorNames: [],
    keywords: [],
    languages: [],
    publisherIris: [],
    mediaTypes: [],
    conformsTo: [],
  };
}

function isNewer(candidate: string, current: string | undefined): boolean {
  return current === undefined || candidate > current;
}

function valuesList(iris: readonly string[]): string {
  return iris.map((iri) => `<${iri}>`).join(' ');
}
