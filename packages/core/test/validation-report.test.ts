import factory from 'rdf-ext';
import { StreamParser } from 'n3';
import type { Valid } from '../src/validator.js';
import { shacl } from '../src/validator.js';
import {
  countWarnings,
  validationReportGraphIri,
} from '../src/validation-report.js';
import { validate } from './validator.test.js';

describe('countWarnings', () => {
  it('counts the sh:Warning-severity results in a validation report', () => {
    const report = factory.dataset([
      factory.quad(
        factory.blankNode('r1'),
        shacl('resultSeverity'),
        shacl('Warning'),
      ),
      factory.quad(
        factory.blankNode('r2'),
        shacl('resultSeverity'),
        shacl('Warning'),
      ),
      factory.quad(
        factory.blankNode('r3'),
        shacl('resultSeverity'),
        shacl('Info'),
      ),
      factory.quad(
        factory.blankNode('r4'),
        shacl('resultSeverity'),
        shacl('Violation'),
      ),
    ]);

    expect(countWarnings(report)).toBe(2);
  });

  it('counts no warnings for a description that validates cleanly', async () => {
    const result = (await validate(
      '../../../../requirements/examples/dataset-schema-org-valid.jsonld',
    )) as Valid;
    expect(countWarnings(result.errors)).toBe(0);
  });

  it('counts the validation warnings on a description', async () => {
    const result = (await validate(
      'dataset-schema-org-genre-deprecated.jsonld',
    )) as Valid;
    expect(countWarnings(result.errors)).toBe(6);
  });

  it('counts every warning in a description with several', async () => {
    // The Gouda Tijdmachine fixture validates with seven sh:Warning results
    // (and two sh:Info, which do not count) — see validator.test.ts snapshot.
    const result = (await validate(
      'dataset-schema-org-gouda-tijdmachine.ttl',
      new StreamParser(),
    )) as Valid;
    expect(countWarnings(result.errors)).toBe(7);
  });
});

describe('validationReportGraphIri', () => {
  it('derives a per-registration named graph IRI from the registration URL', () => {
    const registrationUrl = new URL('https://example.com/catalog');

    expect(validationReportGraphIri(registrationUrl).toString()).toBe(
      'https://data.netwerkdigitaalerfgoed.nl/registry/shacl-validation/' +
        encodeURIComponent('https://example.com/catalog'),
    );
  });
});
