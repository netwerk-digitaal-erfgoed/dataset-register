import {URL} from 'url';

export class Registration {
  private _dateRead?: Date;
  private _statusCode?: number;
  private _datasets: URL[] = [];

  constructor(public readonly url: URL, public readonly datePosted: Date) {}

  /**
   * Mark the Registration as read at a date.
   */
  public read(datasets: URL[], statusCode: number, date: Date = new Date()) {
    this._datasets = datasets;
    this._statusCode = statusCode;
    this._dateRead = date;
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
  store(registration: Registration): void;
  findRegistrationsReadBefore(date: Date): Promise<Registration[]>;
}

export interface AllowedRegistrationDomainStore {
  /**
   * Returns true if the store contains at least one of `domainNames`.
   */
  contains(...domainNames: Array<string>): Promise<boolean>;
}
