import { shacl } from './validator.ts';
import type { Valid } from './validator.ts';
import { dcat, dct } from './query.ts';
import type { NamedNode } from '@rdfjs/types';

// If at least one of the properties in the map’s key is missing (e.g. either created or issued), apply the penalty
// specified in the map’s value (e.g. 10) is applied.
const penalties = new Map<NamedNode[], number>([
  [[dct('description')], 20],
  [[dcat('distribution')], 20],
  [[dct('creator')], 10],
  [[dct('created'), dct('issued')], 10],
  [[dct('modified')], 5],
  [[dcat('keyword'), dct('spatial'), dct('temporal')], 5],
  [[dct('language')], 5],
]);

const worstRating = [...penalties].reduce(
  (score, [, penalty]) => score - penalty,
  100,
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
              shacl('resultMessage'),
            ),
          ][0]?.value,
        );
      }
      return map;
    },
    new Map(),
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
    new Array<Penalty>(),
  );

  // How far the description is from full validity: the number of
  // sh:Warning-severity results in the report (SHACL warnings and probe-emitted
  // warnings alike). Counted from the same per-dataset report the penalties use,
  // so it reflects this dataset only — not its catalogue siblings.
  const warningCount = validationResult.errors.match(
    undefined,
    shacl('resultSeverity'),
    shacl('Warning'),
  ).size;

  return new Rating(appliedPenalties, worstRating, warningCount);
}

export class Penalty {
  public readonly path: string;
  public readonly score: number;

  public constructor(path: string, score: number) {
    this.path = path;
    this.score = score;
  }
}

export class Rating {
  public readonly score: number;
  public readonly explanation: string;
  readonly penalties: Penalty[];
  public readonly worstRating: number;
  public readonly bestRating: number;
  /**
   * Number of sh:Warning-severity validation results for the dataset: how far the
   * description is from full validity, separate from the completeness score.
   */
  public readonly warningCount: number;

  public constructor(
    penalties: Penalty[],
    worstRating: number,
    warningCount = 0,
    bestRating = 100,
  ) {
    this.penalties = penalties;
    this.worstRating = worstRating;
    this.warningCount = warningCount;
    this.bestRating = bestRating;
    this.score = penalties.reduce(
      (score, penalty) => score - penalty.score,
      100,
    );
    this.explanation = penalties.map((penalty) => penalty.path).join(', ');
  }
}

export interface RatingStore {
  store(datasetUri: URL, rating: Rating): Promise<void>;
  /**
   * Delete a rating for a dataset.
   */
  delete(datasetUri: URL): Promise<void>;
}
