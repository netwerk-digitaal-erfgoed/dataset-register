import {URL} from 'url';

export class Registration {
  private _dateRead?: Date;

  constructor(
    public readonly url: URL,
    public readonly datePosted: Date,
    public readonly foundDatasets: URL[]
  ) {}

  /**
   * Mark the Registration as read at a date.
   */
  public read(date: Date = new Date()) {
    this._dateRead = date;
  }

  get dateRead() {
    return this._dateRead;
  }
}

export interface RegistrationStore {
  store(registration: Registration): void;
  findRegistrationsReadBefore(date: Date): Promise<Registration[]>;
}
