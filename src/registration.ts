import {URL} from 'url';

export class Registration {
  private _dateRead?: Date;
  private _statusCode?: number;

  constructor(
    public readonly url: URL,
    public readonly datePosted: Date,
    public readonly foundDatasets: URL[]
  ) {}

  /**
   * Mark the Registration as read at a date.
   */
  public read(statusCode: number, date: Date = new Date()) {
    this._statusCode = statusCode;
    this._dateRead = date;
  }

  get dateRead() {
    return this._dateRead;
  }

  get statusCode() {
    return this._statusCode;
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
