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

    it('returns gone over invalid when both conditions are met', () => {
      // When a URL returns 404 AND has validUntil, gone takes precedence
      // because an unavailable URL is definitively gone regardless of validation state
      const registration = new Registration(
        new URL('https://example.com/registration'),
        new Date(),
      ).read([], 404, false);

      expect(registration.registrationStatus).toBe('gone');
    });

    it('returns gone when no statusCode is recorded', () => {
      // No status code means we never had a usable HTTP response we could
      // classify – fetch error, parse error, or no Dataset triples in the body.
      const registration = new Registration(
        new URL('https://example.com/registration'),
        new Date(),
      ).read([], undefined, false);

      expect(registration.registrationStatus).toBe('gone');
      expect(registration.validUntil).not.toBeUndefined();
    });

    it('returns gone for unreachable URLs even when valid was true', () => {
      // valid=true with no statusCode (e.g. a recovered Registration before its
      // first crawl) still surfaces as gone until we actually reach the URL.
      const registration = new Registration(
        new URL('https://example.com/registration'),
        new Date(),
      ).read([], undefined, true);

      expect(registration.registrationStatus).toBe('gone');
    });
  });
});
