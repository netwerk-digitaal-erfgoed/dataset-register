import { URL } from 'node:url';
import factory from 'rdf-ext';
import {
  REGISTRATION_DATE_CRAWLED_PREDICATE,
  REGISTRATION_MEDIA_TYPE_PREDICATE,
  REGISTRATION_STATUS_BASE_URI,
  REGISTRATION_WARNING_COUNT_PREDICATE,
} from './constants.js';
import { sparqlIri } from './sparql-iri.js';

/**
 * What a single read of a registration URL observed. Passed to {@link Registration.read},
 * which records exactly this and nothing more – see its note on omitted fields.
 */
export interface RegistrationObservation {
  /** The datasets found at the URL. Empty when none were found. */
  datasets: URL[];

  /** The HTTP status last encountered, or undefined when there was no usable response. */
  statusCode: number | undefined;

  /** Whether the description passed SHACL validation. */
  valid: boolean;

  /** When the URL was read. Defaults to now. */
  date?: Date;

  /**
   * The number of sh:Warning-severity results the description produced, or undefined
   * when no validation report was produced at all. Absent is not zero.
   */
  warningCount?: number;

  /**
   * The media type the description was served and parsed as, or undefined when the URL
   * never got far enough to have one.
   */
  mediaType?: string;
}

export class Registration {
  private _dateRead?: Date;
  private _dateCrawled?: Date;
  private _statusCode?: number;
  private _warningCount?: number;
  private _mediaType?: string;
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
    dateCrawled?: Date,
    // Reconstructed by a store so a caller that re-reads a registration can carry the
    // last crawl's warning count forward instead of blanking it. read() overwrites it
    // with what the caller observed, so only a caller that observed nothing passes it on.
    warningCount?: number,
  ) {
    this.url = url;
    this.datePosted = datePosted;
    this.validUntil = validUntil;
    this._datasets = datasets;
    this._dateCrawled = dateCrawled;
    this._warningCount = warningCount;
  }

  /**
   * Mark the Registration as read at a date. Carries the crawl date over
   * unchanged: reading the URL is not crawling it, see {@link crawled}.
   *
   * Every observation is named rather than positional, because read() replaces the
   * whole set: an omitted field is recorded as “not observed”, not “unchanged”. A
   * caller that wants to keep a value it did not observe itself has to pass it on,
   * and with positional arguments that intent was invisible at the call site.
   */
  public read(observation: RegistrationObservation): Registration {
    const { datasets, statusCode, valid, warningCount, mediaType } =
      observation;
    const date = observation.date ?? new Date();
    const registration = new Registration(
      this.url,
      this.datePosted,
      valid ? undefined : (this.validUntil ?? date),
      datasets,
      this._dateCrawled,
    );
    registration._statusCode = statusCode;
    registration._dateRead = date;
    registration._warningCount = warningCount;
    registration._mediaType = mediaType;

    return registration;
  }

  /**
   * Mark the Registration as crawled at a date, which is also when its
   * distributions were last probed.
   *
   * Only the crawler calls this. A manual re-registration through the API reads
   * the URL and re-stores the description, but probes nothing – so it advances
   * dateRead and must leave the crawl clock alone, or the registration is never
   * due again and its probe state freezes indefinitely.
   */
  public crawled(date: Date = new Date()): Registration {
    // Copy-on-write like read(), so crawled() on an instance handed out by a
    // store cannot mutate the store's own copy.
    const registration = new Registration(
      this.url,
      this.datePosted,
      this.validUntil,
      this._datasets,
      date,
    );
    registration._statusCode = this._statusCode;
    registration._dateRead = this._dateRead;
    registration._warningCount = this._warningCount;
    registration._mediaType = this._mediaType;

    return registration;
  }

  get dateRead() {
    return this._dateRead;
  }

  get dateCrawled() {
    return this._dateCrawled;
  }

  get statusCode() {
    return this._statusCode;
  }

  /**
   * The number of sh:Warning-severity results the registration's description
   * produced at the last crawl, or undefined when no validation report was
   * recorded (e.g. the URL was gone before it could be validated).
   */
  get warningCount() {
    return this._warningCount;
  }

  /**
   * The media type the description was served and parsed as at the last read, or
   * undefined when the URL never got far enough to have one (HTTP error, timeout,
   * transport failure). For a paginated catalogue this is the first page only.
   */
  get mediaType() {
    return this._mediaType;
  }

  get datasets() {
    return this._datasets;
  }

  /**
   * Computed registration status based on statusCode and validUntil.
   * - 'gone': URL did not yield a usable RDF response (HTTP status > 200, or no
   *   response we could classify – fetch error, parse error, no datasets in body).
   * - 'invalid': URL responded with usable RDF but validation failed (has validUntil).
   * - 'valid': healthy registration.
   */
  get registrationStatus(): 'valid' | 'invalid' | 'gone' {
    if (this._statusCode === undefined || this._statusCode > 200) {
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
  /**
   * Registrations due for a crawl: crawled before `date`, or never crawled.
   */
  findRegistrationsCrawledBefore(date: Date): Promise<Registration[]>;
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

  /**
   * Add `domainName` to the allow list. Idempotent: adding an already-allowed
   * domain is a no-op.
   */
  add(domainName: string): Promise<void>;
}

export function toRdf(registration: Registration) {
  const iri = factory.namedNode(sparqlIri(registration.url));

  const quads = [
    factory.quad(
      iri,
      factory.namedNode('https://schema.org/datePosted'),
      factory.literal(
        registration.datePosted.toISOString(),
        factory.namedNode('http://www.w3.org/2001/XMLSchema#dateTime'),
      ),
    ),
    factory.quad(
      iri,
      factory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
      factory.namedNode('https://schema.org/EntryPoint'),
    ),
    factory.quad(
      iri,
      factory.namedNode('https://schema.org/encoding'),
      factory.namedNode('https://schema.org'), // Currently the only vocabulary that we support.
    ),
    ...registration.datasets.flatMap((datasetIri) => {
      const datasetQuads = [
        factory.quad(
          iri,
          factory.namedNode('https://schema.org/about'),
          factory.namedNode(datasetIri.toString()),
        ),
        factory.quad(
          factory.namedNode(datasetIri.toString()),
          factory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
          factory.namedNode('https://schema.org/Dataset'),
        ),
        factory.quad(
          factory.namedNode(datasetIri.toString()),
          factory.namedNode('https://schema.org/subjectOf'),
          iri,
        ),
      ];
      if (registration.dateRead !== undefined) {
        datasetQuads.push(
          factory.quad(
            factory.namedNode(datasetIri.toString()),
            factory.namedNode('https://schema.org/dateRead'),
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
        factory.namedNode('https://schema.org/dateRead'),
        factory.literal(
          registration.dateRead.toISOString(),
          factory.namedNode('http://www.w3.org/2001/XMLSchema#dateTime'),
        ),
      ),
    );
  }

  if (registration.dateCrawled !== undefined) {
    quads.push(
      factory.quad(
        iri,
        factory.namedNode(REGISTRATION_DATE_CRAWLED_PREDICATE),
        factory.literal(
          registration.dateCrawled.toISOString(),
          factory.namedNode('http://www.w3.org/2001/XMLSchema#dateTime'),
        ),
      ),
    );
  }

  if (registration.statusCode !== undefined) {
    quads.push(
      factory.quad(
        iri,
        factory.namedNode('https://schema.org/status'),
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
        factory.namedNode('https://schema.org/validUntil'),
        factory.literal(
          registration.validUntil.toISOString(),
          factory.namedNode('http://www.w3.org/2001/XMLSchema#dateTime'),
        ),
      ),
    );
  }

  if (registration.warningCount !== undefined) {
    quads.push(
      factory.quad(
        iri,
        factory.namedNode(REGISTRATION_WARNING_COUNT_PREDICATE),
        factory.literal(
          registration.warningCount.toString(),
          factory.namedNode('http://www.w3.org/2001/XMLSchema#integer'),
        ),
      ),
    );
  }

  if (registration.mediaType !== undefined) {
    quads.push(
      factory.quad(
        iri,
        factory.namedNode(REGISTRATION_MEDIA_TYPE_PREDICATE),
        factory.literal(registration.mediaType),
      ),
    );
  }

  // Emit computed registration status as schema:additionalType
  quads.push(
    factory.quad(
      iri,
      factory.namedNode('https://schema.org/additionalType'),
      factory.namedNode(
        `${REGISTRATION_STATUS_BASE_URI}${registration.registrationStatus}`,
      ),
    ),
  );

  return quads;
}
