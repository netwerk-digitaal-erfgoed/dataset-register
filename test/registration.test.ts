import {Registration} from '../src/registration';
import {URL} from 'url';

describe('Registration', () => {
  it('must toggle from valid to invalid', () => {
    const registration = new Registration(
      new URL('https://example.com/registration'),
      new Date(),
    );

    const updatedRegistration = registration.read([], 200, true);
    expect(updatedRegistration.validUntil).toBeUndefined();

    const dateRead = new Date();
    const becameInvalid = updatedRegistration.read([], 200, false, dateRead);
    expect(becameInvalid.validUntil).toEqual(dateRead);

    const stillInvalid = becameInvalid.read([], 200, false);
    expect(stillInvalid.validUntil).toEqual(dateRead);

    const becameValidAgain = stillInvalid.read([], 200, true);
    expect(becameValidAgain.validUntil).toBeUndefined();
  });
});
