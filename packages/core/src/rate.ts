import { shacl } from './validator.ts';
import type { Valid } from './validator.ts';
import { datasetType, dcat, dct } from './query.ts';
import { DataFactory } from 'n3';
import type { DatasetCore, NamedNode, Quad_Subject } from '@rdfjs/types';

const rdfType = DataFactory.namedNode(
  'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
);

// If at least one of the properties in the map’s key is missing (e.g. either created or issued), apply the penalty
// specified in the map’s value (e.g. 10) is applied.
const penalties = new Map<NamedNode[], number>([
  [[dct('description')], 20],
  [[dcat('distribution')], 20],
  [[dct('creator')], 10],
  [[dct('created'), dct('issued')], 10],
  [[dct('modified')], 5],
  [[dct('spatial'), dct('temporal')], 5],
  [[dct('language')], 5],
]);

const worstRating = [...penalties].reduce(
  (score, [, penalty]) => score - penalty,
  100,
);

/**
 * Rate the description of `dataset`. Only results on the dcat:Dataset itself
 * count: a distribution can miss a property of the same name, such as
 * dct:description.
 */
export function rate(validationResult: Valid, dataset: DatasetCore): Rating {
  const datasetNodes = [...dataset.match(null, rdfType, datasetType)].map(
    (quad) => quad.subject,
  );
  const violations: Map<string, string> = [...validationResult.errors].reduce(
    (map, quad) => {
      if (
        quad.predicate.equals(shacl('resultPath')) &&
        isMissingProperty(validationResult, quad.subject) &&
        isAbout(validationResult, quad.subject, datasetNodes)
      ) {
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

  return new Rating(appliedPenalties, worstRating);
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

  public constructor(
    penalties: Penalty[],
    worstRating: number,
    bestRating = 100,
  ) {
    this.penalties = penalties;
    this.worstRating = worstRating;
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

// A property that is present but ill-formed also yields a result on its path;
// only a failed sh:minCount means the property is missing.
const isMissingProperty = (
  validationResult: Valid,
  result: Quad_Subject,
): boolean =>
  validationResult.errors.match(
    result,
    shacl('sourceConstraintComponent'),
    shacl('MinCountConstraintComponent'),
  ).size > 0;

const isAbout = (
  validationResult: Valid,
  result: Quad_Subject,
  datasetNodes: Quad_Subject[],
): boolean =>
  datasetNodes.some(
    (datasetNode) =>
      validationResult.errors.match(result, shacl('focusNode'), datasetNode)
        .size > 0,
  );
