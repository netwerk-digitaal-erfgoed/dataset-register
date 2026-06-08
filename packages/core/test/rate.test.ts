import { rate } from '../src/rate.js';
import type { Valid } from '../src/validator.js';
import { validate } from './validator.test.js';
import { StreamParser } from 'n3';

describe('Rate', () => {
  it('rates minimal dataset description', async () => {
    const validationResult = (await validate(
      'dataset-dcat-valid-minimal.jsonld',
    )) as Valid;
    expect(rate(validationResult).worstRating).toBe(25);
    expect(rate(validationResult).score).toBe(25);
  });

  it('rates complete dataset description', async () => {
    const validationResult = (await validate(
      'dataset-dcat-valid.jsonld',
    )) as Valid;
    const rating = rate(validationResult);
    expect(rating.score).toBe(100);
    expect(rating.explanation).toBe('');
  });

  it('reports no warnings for a description that validates cleanly', async () => {
    const validationResult = (await validate(
      '../../../../requirements/examples/dataset-schema-org-valid.jsonld',
    )) as Valid;
    expect(rate(validationResult).warningCount).toBe(0);
  });

  it('counts the validation warnings on a description', async () => {
    const validationResult = (await validate(
      'dataset-schema-org-genre-deprecated.jsonld',
    )) as Valid;
    expect(rate(validationResult).warningCount).toBe(6);
  });

  it('counts every warning in a description with several', async () => {
    // The Gouda Tijdmachine fixture validates with seven sh:Warning results
    // (and two sh:Info, which do not count) — see validator.test.ts snapshot.
    const validationResult = (await validate(
      'dataset-schema-org-gouda-tijdmachine.ttl',
      new StreamParser(),
    )) as Valid;
    expect(rate(validationResult).warningCount).toBe(7);
  });
});
