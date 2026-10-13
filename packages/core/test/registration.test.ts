import { Registration, toRdf } from '../src/registration.js';
import {
  REGISTRATION_DATE_CRAWLED_PREDICATE,
  REGISTRATION_MEDIA_TYPE_PREDICATE,
  REGISTRATION_WARNING_COUNT_PREDICATE,
} from '../src/constants.js';
import { URL } from 'url';

describe('Registration', () => {
  describe('crawl date', () => {
    // Reading the URL is not crawling it: the API re-reads and re-stores the
    // description on every re-registration but probes nothing, so letting that
    // advance the crawl clock leaves the registration never due again and its
    // distribution-health records frozen indefinitely.
    it('is left alone by read()', () => {
      const dateCrawled = new Date('2026-08-01T10:00:00Z');
      const registration = new Registration(
        new URL('https://example.com/registration'),
        new Date('2026-01-01T00:00:00Z'),
        undefined,
        [],
        dateCrawled,
      );

      const reRegistered = registration.read({
        datasets: [],
        statusCode: 200,
        valid: true,
      });

      expect(reRegistered.dateCrawled).toEqual(dateCrawled);
      expect(reRegistered.dateRead).not.toEqual(dateCrawled);
    });

    it('is undefined until the crawler sets it', () => {
      const registration = new Registration(
        new URL('https://example.com/registration'),
        new Date('2026-01-01T00:00:00Z'),
      ).read({ datasets: [], statusCode: 200, valid: true });

      expect(registration.dateCrawled).toBeUndefined();
    });

    it('does not leak back into the instance crawled() was called on', () => {
      // Copy-on-write like read(): a Registration handed out by a store must not
      // acquire a crawl date just because a caller derived one from it.
      const stored = new Registration(
        new URL('https://example.com/registration'),
        new Date('2026-01-01T00:00:00Z'),
      );

      stored.crawled(new Date('2026-08-05T12:00:00Z'));

      expect(stored.dateCrawled).toBeUndefined();
    });

    it('is advanced by crawled() and serialised', () => {
      const dateCrawled = new Date('2026-08-05T12:00:00Z');
      const registration = new Registration(
        new URL('https://example.com/registration'),
        new Date('2026-01-01T00:00:00Z'),
      )
        .read({ datasets: [], statusCode: 200, valid: true })
        .crawled(dateCrawled);

      expect(registration.dateCrawled).toEqual(dateCrawled);

      const quad = toRdf(registration).find(
        (candidate) =>
          candidate.predicate.value === REGISTRATION_DATE_CRAWLED_PREDICATE,
      );
      expect(quad?.object.value).toBe(dateCrawled.toISOString());
    });
  });

  it('must toggle from valid to invalid', () => {
    const registration = new Registration(
      new URL('https://example.com/registration'),
      new Date(),
    );

    const updatedRegistration = registration.read({
      datasets: [],
      statusCode: 200,
      valid: true,
    });
    expect(updatedRegistration.validUntil).toBeUndefined();

    const dateRead = new Date();
    const becameInvalid = updatedRegistration.read({
      datasets: [],
      statusCode: 200,
      valid: false,
      date: dateRead,
    });
    expect(becameInvalid.validUntil).toEqual(dateRead);

    const stillInvalid = becameInvalid.read({
      datasets: [],
      statusCode: 200,
      valid: false,
    });
    expect(stillInvalid.validUntil).toEqual(dateRead);

    const becameValidAgain = stillInvalid.read({
      datasets: [],
      statusCode: 200,
      valid: true,
    });
    expect(becameValidAgain.validUntil).toBeUndefined();
  });

  describe('toRdf', () => {
    it('emits nde:warningCount when a warning count was recorded', () => {
      const registration = new Registration(
        new URL('https://example.com/registration'),
        new Date(),
      ).read({ datasets: [], statusCode: 200, valid: true, warningCount: 3 });

      const quads = toRdf(registration);
      const warningCountQuad = quads.find(
        (quad) => quad.predicate.value === REGISTRATION_WARNING_COUNT_PREDICATE,
      );

      expect(warningCountQuad?.object.value).toBe('3');
      expect(warningCountQuad?.object.termType).toBe('Literal');
      expect(
        warningCountQuad?.object.termType === 'Literal'
          ? warningCountQuad.object.datatype.value
          : undefined,
      ).toBe('http://www.w3.org/2001/XMLSchema#integer');
    });

    it('omits nde:warningCount when no validation report was recorded', () => {
      const registration = new Registration(
        new URL('https://example.com/registration'),
        new Date(),
      ).read({ datasets: [], statusCode: 200, valid: true });

      const quads = toRdf(registration);

      expect(
        quads.find(
          (quad) =>
            quad.predicate.value === REGISTRATION_WARNING_COUNT_PREDICATE,
        ),
      ).toBeUndefined();
    });

    it('emits nde:mediaType as a plain literal when one was recorded', () => {
      // A plain literal, not an IRI: the value is a media type string, and the
      // register has no vocabulary of media-type IRIs to point at.
      const registration = new Registration(
        new URL('https://example.com/registration'),
        new Date(),
      ).read({
        datasets: [],
        statusCode: 200,
        valid: true,
        mediaType: 'text/turtle',
      });

      const quad = toRdf(registration).find(
        (candidate) =>
          candidate.predicate.value === REGISTRATION_MEDIA_TYPE_PREDICATE,
      );

      expect(quad?.object.value).toBe('text/turtle');
      expect(quad?.object.termType).toBe('Literal');
    });

    it('omits nde:mediaType when the URL never got far enough to have one', () => {
      // An HTTP error, timeout or transport failure yields no media type, and the
      // absent triple is what distinguishes that from “served as something odd”.
      const registration = new Registration(
        new URL('https://example.com/registration'),
        new Date(),
      ).read({ datasets: [], statusCode: undefined, valid: false });

      expect(
        toRdf(registration).find(
          (quad) => quad.predicate.value === REGISTRATION_MEDIA_TYPE_PREDICATE,
        ),
      ).toBeUndefined();
    });

    it('carries nde:mediaType through crawled()', () => {
      // crawled() only advances the clock, so everything read() observed must survive it
      // or the stored registration loses the media type on every crawl.
      const registration = new Registration(
        new URL('https://example.com/registration'),
        new Date(),
      )
        .read({
          datasets: [],
          statusCode: 200,
          valid: true,
          mediaType: 'application/ld+json',
        })
        .crawled(new Date('2026-08-05T12:00:00Z'));

      expect(registration.mediaType).toBe('application/ld+json');
    });
  });

  describe('registrationStatus', () => {
    it('returns valid for healthy registration', () => {
      const registration = new Registration(
        new URL('https://example.com/registration'),
        new Date(),
      ).read({ datasets: [], statusCode: 200, valid: true });

      expect(registration.registrationStatus).toBe('valid');
    });

    it('returns invalid when validUntil is set', () => {
      const registration = new Registration(
        new URL('https://example.com/registration'),
        new Date(),
      ).read({ datasets: [], statusCode: 200, valid: false });

      expect(registration.registrationStatus).toBe('invalid');
    });

    it('returns gone when HTTP status > 200', () => {
      const registration = new Registration(
        new URL('https://example.com/registration'),
        new Date(),
      ).read({ datasets: [], statusCode: 404, valid: true });

      expect(registration.registrationStatus).toBe('gone');
    });

    it('returns gone over invalid when both conditions are met', () => {
      // When a URL returns 404 AND has validUntil, gone takes precedence
      // because an unavailable URL is definitively gone regardless of validation state
      const registration = new Registration(
        new URL('https://example.com/registration'),
        new Date(),
      ).read({ datasets: [], statusCode: 404, valid: false });

      expect(registration.registrationStatus).toBe('gone');
    });

    it('returns gone when no statusCode is recorded', () => {
      // No status code means we never had a usable HTTP response we could
      // classify – fetch error, parse error, or no Dataset triples in the body.
      const registration = new Registration(
        new URL('https://example.com/registration'),
        new Date(),
      ).read({ datasets: [], statusCode: undefined, valid: false });

      expect(registration.registrationStatus).toBe('gone');
      expect(registration.validUntil).not.toBeUndefined();
    });

    it('returns gone for unreachable URLs even when valid was true', () => {
      // valid=true with no statusCode (e.g. a recovered Registration before its
      // first crawl) still surfaces as gone until we actually reach the URL.
      const registration = new Registration(
        new URL('https://example.com/registration'),
        new Date(),
      ).read({ datasets: [], statusCode: undefined, valid: true });

      expect(registration.registrationStatus).toBe('gone');
    });
  });
});
