import { rate } from '../src/rate.js';
import type { Valid } from '../src/validator.js';
import { validate } from './validator.test.js';

describe('Rate', () => {
  it('rates minimal dataset description', async () => {
    const validationResult = (await validate(
      'dataset-dcat-valid-minimal.jsonld',
    )) as Valid;
    // worstRating shifted from 25 → 0 after accessURL/downloadURL (15) and mediaType
    // (10) penalties were added for probe-derived violations (see issue #628). The
    // minimal fixture has no distribution, so those two new penalties don’t fire and
    // the applied score stays at 25.
    expect(rate(validationResult).worstRating).toBe(0);
    expect(rate(validationResult).score).toBe(25);
  });

  it('rates complete dataset description', async () => {
    const validationResult = (await validate(
      'dataset-dcat-valid.jsonld',
    )) as Valid;
    const rating = rate(validationResult);
    // The SPARQL-query dcat:mediaType in the fixture trips the existing sh:Warning on
    // dcat:mediaType, which now contributes 10 points through the rate.ts penalty map.
    expect(rating.score).toBe(90);
    expect(rating.explanation).toBe('http://www.w3.org/ns/dcat#mediaType');
  });
});
