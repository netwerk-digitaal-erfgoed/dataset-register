import { URL } from 'node:url';
import factory from 'rdf-ext';
import { REGISTRATION_STATUS_BASE_URI } from './constants.js';

export class Registration {
  private _dateRead?: Date;
  private _statusCode?: number;
  private _datasets: URL[];
  public readonly url: URL;
  public readonly datePosted: Date;
  /**
   * If the Registration has become invalid, the date at which it did so.
   */
  public readonly validUntil?: Date;

  constructor(
    url: URL,
    datePosted: Date,
    validUntil?: Date,
    datasets: URL[] = [],
  ) {
    this.url = url;
    this.datePosted = datePosted;
    this.validUntil = validUntil;
    this._datasets = datasets;
  }

  /**
   * Mark the Registration as read at a date.
   */
  public read(
    datasets: URL[],
    statusCode: number,
    valid: boolean,
    date: Date = new Date(),
  ): Registration {
    const registration = new Registration(
      this.url,
      this.datePosted,
      valid ? undefined : (this.validUntil ?? date),
      datasets,
    );
    registration._statusCode = statusCode;
    registration._dateRead = date;

    return registration;
  }

  get dateRead() {
    return this._dateRead;
  }

  get statusCode() {
    return this._statusCode;
  }

  get datasets() {
    return this._datasets;
  }

  /**
   * Computed registration status based on statusCode and validUntil.
   * - 'invalid': validation failed (has validUntil)
   * - 'gone': URL unavailable (HTTP status > 200)
   * - 'valid': healthy registration
   */
  get registrationStatus(): 'valid' | 'invalid' | 'gone' {
    if (this._statusCode !== undefined && this._statusCode > 200) {
      return 'gone';
    }
    if (this.validUntil !== undefined) {
      return 'invalid';
    }
    return 'valid';
  }
}

export interface RegistrationStore {
  /**
   * Store a {@link Registration}, replacing any Registrations with the same URL.
   */
  store(registration: Registration): Promise<void>;
  findRegistrationsReadBefore(date: Date): Promise<Registration[]>;
  findByUrl(url: URL): Promise<Registration | undefined>;
  /**
   * Delete a Registration and all its linked datasets from the registrations graph.
   */
  delete(url: URL): Promise<void>;
}

export interface AllowedRegistrationDomainStore {
  /**
   * Returns true if the store contains at least one of `domainNames`.
   */
  contains(...domainNames: Array<string>): Promise<boolean>;
}

export function toRdf(registration: Registration) {
  const iri = factory.namedNode(registration.url.toString());

  const quads = [
    factory.quad(
      iri,
      factory.namedNode('http://schema.org/datePosted'),
      factory.literal(
        registration.datePosted.toISOString(),
        factory.namedNode('http://www.w3.org/2001/XMLSchema#dateTime'),
      ),
    ),
    factory.quad(
      iri,
      factory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
      factory.namedNode('http://schema.org/EntryPoint'),
    ),
    factory.quad(
      iri,
      factory.namedNode('http://schema.org/encoding'),
      factory.namedNode('http://schema.org'), // Currently the only vocabulary that we support.
    ),
    ...registration.datasets.flatMap((datasetIri) => {
      const datasetQuads = [
        factory.quad(
          iri,
          factory.namedNode('http://schema.org/about'),
          factory.namedNode(datasetIri.toString()),
        ),
        factory.quad(
          factory.namedNode(datasetIri.toString()),
          factory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
          factory.namedNode('http://schema.org/Dataset'),
        ),
        factory.quad(
          factory.namedNode(datasetIri.toString()),
          factory.namedNode('http://schema.org/subjectOf'),
          factory.namedNode(registration.url.toString()),
        ),
      ];
      if (registration.dateRead !== undefined) {
        datasetQuads.push(
          factory.quad(
            factory.namedNode(datasetIri.toString()),
            factory.namedNode('http://schema.org/dateRead'),
            factory.literal(
              registration.dateRead.toISOString(),
              factory.namedNode('http://www.w3.org/2001/XMLSchema#dateTime'),
            ),
          ),
        );
      }
      return datasetQuads;
    }),
  ];
  if (registration.dateRead !== undefined) {
    quads.push(
      factory.quad(
        iri,
        factory.namedNode('http://schema.org/dateRead'),
        factory.literal(
          registration.dateRead.toISOString(),
          factory.namedNode('http://www.w3.org/2001/XMLSchema#dateTime'),
        ),
      ),
    );
  }

  if (registration.statusCode !== undefined) {
    quads.push(
      factory.quad(
        iri,
        factory.namedNode('http://schema.org/status'),
        factory.literal(
          registration.statusCode.toString(),
          factory.namedNode('http://www.w3.org/2001/XMLSchema#integer'),
        ),
      ),
    );
  }

  if (registration.validUntil !== undefined) {
    quads.push(
      factory.quad(
        iri,
        factory.namedNode('http://schema.org/validUntil'),
        factory.literal(
          registration.validUntil.toISOString(),
          factory.namedNode('http://www.w3.org/2001/XMLSchema#dateTime'),
        ),
      ),
    );
  }

  // Emit computed registration status as schema:additionalType
  quads.push(
    factory.quad(
      iri,
      factory.namedNode('http://schema.org/additionalType'),
      factory.namedNode(
        `${REGISTRATION_STATUS_BASE_URI}${registration.registrationStatus}`,
      ),
    ),
  );

  return quads;
}
