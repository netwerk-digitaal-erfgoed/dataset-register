import {shacl, Valid} from './validator.js';
import {dcat, dct} from './query.js';

const penalties = new Map([
  [[dct('description')], 20],
  [[dcat('distribution')], 20],
  [[dct('creator')], 10],
  [[dct('created'), dct('issued')], 10],
  [[dct('modified')], 5],
  [[dct('keyword'), dct('spatial'), dct('temporal')], 5],
  [[dct('language')], 5],
]);

const worstRating = [...penalties].reduce(
  (score, [, penalty]) => score - penalty,
  100
);

export function rate(validationResult: Valid): Rating {
  const violations: Map<string, string> = [...validationResult.errors].reduce(
    (map, quad) => {
      if (quad.predicate.equals(shacl('resultPath'))) {
        map.set(
          quad.object.value,
          [
            ...validationResult.errors.match(
              quad.subject,
              shacl('resultMessage')
            ),
          ][0]?.value
        );
      }
      return map;
    },
    new Map()
  );

  const appliedPenalties = [...penalties].reduce(
    (appliedPenalties, [properties, penalty]) => {
      for (const property of properties) {
        if (!violations.has(property.value)) {
          return appliedPenalties;
        }
      }

      return [...appliedPenalties, new Penalty(properties[0].value, penalty)];
    },
    new Array<Penalty>()
  );

  return new Rating(appliedPenalties, worstRating);
}

export class Penalty {
  public constructor(
    public readonly path: string,
    public readonly score: number
  ) {}
}

export class Rating {
  public readonly score: number;
  public readonly explanation: string;

  public constructor(
    private readonly penalties: Penalty[],
    public readonly worstRating: number,
    public readonly bestRating = 100
  ) {
    this.score = penalties.reduce(
      (score, penalty) => score - penalty.score,
      100
    );
    this.explanation = penalties.map(penalty => penalty.path).join(', ');
  }
}

export interface RatingStore {
  store(datasetUri: URL, rating: Rating): Promise<void>;
}
