import { rate } from '../src/rate.js';
import type { Valid } from '../src/validator.js';
import { dataset, validate } from './validator.test.js';

describe('Rate', () => {
  it('rates minimal dataset description', async () => {
    const filename = 'dataset-dcat-valid-minimal.jsonld';
    const validationResult = (await validate(filename)) as Valid;
    const rating = rate(validationResult, await dataset(filename));
    expect(rating.worstRating).toBe(25);
    expect(rating.score).toBe(25);
  });

  it('rates complete dataset description', async () => {
    // The description’s dct:language values are language codes, which give a
    // warning; a property that is present but ill-formed costs no points.
    // One of its distributions lacks a dct:description, which costs the dataset nothing.
    const filename = 'dataset-dcat-valid.jsonld';
    const validationResult = (await validate(filename)) as Valid;
    const rating = rate(validationResult, await dataset(filename));
    expect(rating.score).toBe(100);
    expect(rating.explanation).toBe('');
  });
});
