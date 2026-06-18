import { describe, expect, it } from 'vitest';
import factory from 'rdf-ext';
import type { NamedNode, Quad } from '@rdfjs/types';
import type { ValidityVerdict } from '@lde/distribution-health';
import { distributionValidityQuads } from '../src/distribution-validity.js';

const DISTRIBUTION_URL = 'https://example.org/dump.ttl';
const PRODUCER = 'https://datasetregister.netwerkdigitaalerfgoed.nl/#crawler';
const GENERATED_AT = new Date('2026-06-18T12:00:00.000Z');

const dqv = (property: string): NamedNode =>
  factory.namedNode(`http://www.w3.org/ns/dqv#${property}`);
const prov = (property: string): NamedNode =>
  factory.namedNode(`http://www.w3.org/ns/prov#${property}`);
const failure = (property: string): NamedNode =>
  factory.namedNode(`https://def.nde.nl/failure#${property}`);
const probe = (property: string): NamedNode =>
  factory.namedNode(`https://def.nde.nl/probe#${property}`);

function objectOf(quads: Quad[], predicate: NamedNode): string | undefined {
  return quads.find((quad) => quad.predicate.equals(predicate))?.object.value;
}

describe('distributionValidityQuads', () => {
  it('maps a valid verdict to a boolean measurement on the distribution', () => {
    const verdict: ValidityVerdict = {
      valid: true,
      validatedFingerprint: '2026-06-01T00:00:00.000Z|2048',
      depth: 'shallow',
    };

    const quads = distributionValidityQuads(verdict, {
      distributionUrl: DISTRIBUTION_URL,
      generatedAt: GENERATED_AT,
      producer: PRODUCER,
    });

    expect(objectOf(quads, dqv('isMeasurementOf'))).toBe(
      'https://def.nde.nl/metric#distribution-rdf-valid',
    );
    expect(objectOf(quads, dqv('computedOn'))).toBe(DISTRIBUTION_URL);
    expect(objectOf(quads, dqv('value'))).toBe('true');
    expect(objectOf(quads, prov('generatedAtTime'))).toBe(
      GENERATED_AT.toISOString(),
    );
    expect(objectOf(quads, prov('wasAssociatedWith'))).toBe(PRODUCER);
    expect(objectOf(quads, probe('sourceFingerprint'))).toBe(
      '2026-06-01T00:00:00.000Z|2048',
    );
    // A valid verdict carries no failure usage.
    expect(quads.some((quad) => quad.predicate.equals(failure('reason')))).toBe(
      false,
    );
  });

  it('maps an invalid parse-error verdict to the failure usage with its message', () => {
    const verdict: ValidityVerdict = {
      valid: false,
      reason: 'parse-error',
      message: 'Unexpected "}" on line 3',
      validatedFingerprint: 'fp-1',
      depth: 'shallow',
    };

    const quads = distributionValidityQuads(verdict, {
      distributionUrl: DISTRIBUTION_URL,
      generatedAt: GENERATED_AT,
      producer: PRODUCER,
    });

    expect(objectOf(quads, dqv('value'))).toBe('false');
    expect(objectOf(quads, failure('reason'))).toBe(
      'https://def.nde.nl/distribution-validity-failure#parse-error',
    );
    expect(objectOf(quads, failure('message'))).toBe(
      'Unexpected "}" on line 3',
    );
    // The usage is reached forward from the measurement's activity.
    expect(
      quads.some((quad) => quad.predicate.equals(prov('qualifiedUsage'))),
    ).toBe(true);
  });

  it('maps an empty verdict to the empty reason without a message', () => {
    const verdict: ValidityVerdict = {
      valid: false,
      reason: 'empty',
      validatedFingerprint: 'fp-2',
      depth: 'shallow',
    };

    const quads = distributionValidityQuads(verdict, {
      distributionUrl: DISTRIBUTION_URL,
      generatedAt: GENERATED_AT,
      producer: PRODUCER,
    });

    expect(objectOf(quads, failure('reason'))).toBe(
      'https://def.nde.nl/distribution-validity-failure#empty',
    );
    expect(
      quads.some((quad) => quad.predicate.equals(failure('message'))),
    ).toBe(false);
  });

  it('omits the fingerprint when none was established', () => {
    const verdict: ValidityVerdict = {
      valid: true,
      validatedFingerprint: null,
      depth: 'shallow',
    };

    const quads = distributionValidityQuads(verdict, {
      distributionUrl: DISTRIBUTION_URL,
      generatedAt: GENERATED_AT,
      producer: PRODUCER,
    });

    expect(
      quads.some((quad) => quad.predicate.equals(probe('sourceFingerprint'))),
    ).toBe(false);
  });
});
