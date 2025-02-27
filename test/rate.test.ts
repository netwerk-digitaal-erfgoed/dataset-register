import {rate} from '../src/rate';
import {Valid} from '../src/validator';
import {validate} from './validator.test';

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
});
