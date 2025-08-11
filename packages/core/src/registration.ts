import {URL} from 'node:url';

export class Registration {
  private _dateRead?: Date;
  private _statusCode?: number;
  private _datasets: URL[] = [];
  public readonly url: URL;
  public readonly datePosted: Date;
  /**
   * If the Registration has become invalid, the date at which it did so.
   */
  public readonly validUntil?: Date;

  constructor(url: URL, datePosted: Date, validUntil?: Date) {
    this.url = url;
    this.datePosted = datePosted;
    this.validUntil = validUntil;
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
    );
    registration._datasets = datasets;
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
}

export interface RegistrationStore {
  /**
   * Store a {@see Registration}, replacing any Registrations with the same URL.
   */
  store(registration: Registration): Promise<void>;
  findRegistrationsReadBefore(date: Date): Promise<Registration[]>;
}

export interface AllowedRegistrationDomainStore {
  /**
   * Returns true if the store contains at least one of `domainNames`.
   */
  contains(...domainNames: Array<string>): Promise<boolean>;
}
