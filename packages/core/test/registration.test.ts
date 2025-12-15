import { Registration } from '../src/registration.js';
import { URL } from 'url';

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

  describe('registrationStatus', () => {
    it('returns valid for healthy registration', () => {
      const registration = new Registration(
        new URL('https://example.com/registration'),
        new Date(),
      ).read([], 200, true);

      expect(registration.registrationStatus).toBe('valid');
    });

    it('returns invalid when validUntil is set', () => {
      const registration = new Registration(
        new URL('https://example.com/registration'),
        new Date(),
      ).read([], 200, false);

      expect(registration.registrationStatus).toBe('invalid');
    });

    it('returns gone when HTTP status > 200', () => {
      const registration = new Registration(
        new URL('https://example.com/registration'),
        new Date(),
      ).read([], 404, true);

      expect(registration.registrationStatus).toBe('gone');
    });

    it('returns invalid over gone when both conditions are met', () => {
      // When a URL returns 404 AND has validUntil, invalid takes precedence
      const registration = new Registration(
        new URL('https://example.com/registration'),
        new Date(),
      ).read([], 404, false);

      expect(registration.registrationStatus).toBe('invalid');
    });
  });
});
