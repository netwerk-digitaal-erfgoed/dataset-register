import {URL} from 'url';

export class Registration {
  private dateRead?: Date;

  constructor(public readonly url: URL, public readonly foundDatasets: URL[]) {}

  /**
   * Mark the Registration as read at a date.
   */
  public read(date: Date = new Date()) {
    this.dateRead = date;
  }
}

export interface RegistrationStore {
  store(registration: Registration): void;
}
