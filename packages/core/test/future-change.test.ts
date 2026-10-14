import { readFileSync } from 'node:fs';
import { DataFactory, Parser, Store } from 'n3';
import type { NamedNode, Quad, Quad_Subject } from '@rdfjs/types';

/**
 * Publishers learn about version 2.0 from the validator’s warnings, so every rule
 * that `nde:futureChange` announces must already give one. An annotation alone
 * only labels the spec: breaking the rule would go from silence to rejection.
 */
describe('nde:futureChange', () => {
  it('announces only severity changes of shapes that warn today', () => {
    const notWarning = annotatedShapes()
      .filter(({ change }) => becomesViolation(change))
      .filter(({ shape }) => hasConstraint(shape))
      .filter(({ shape }) => !warns(shape))
      .map(({ shape }) => describeShape(shape));
    expect(notWarning).toEqual([]);
  });

  it('announces only constraints that a shape already warns about', () => {
    const unannounced = annotatedShapes().flatMap(({ shape, change }) =>
      constraintsOf(change)
        .filter((constraint) => !warnedAbout(shape, constraint))
        .map(
          (constraint) =>
            `${describeShape(shape)} ${constraint.predicate.value} ${constraint.object.value}`,
        ),
    );
    expect(unannounced).toEqual([]);
  });

  it('documents a property without constraints only where another shape warns', () => {
    const documentationOnly = annotatedShapes()
      .filter(({ change }) => becomesViolation(change))
      .filter(({ shape }) => !hasConstraint(shape));
    expect(documentationOnly.map(({ shape }) => describeShape(shape))).toEqual(
      Object.keys(warnedAboutElsewhere),
    );
    for (const warningShape of Object.values(warnedAboutElsewhere)) {
      const shape = DataFactory.namedNode(warningShape);
      expect(warns(shape)).toBe(true);
      expect(
        store
          .getObjects(shape, futureChange, null)
          .some((change) => becomesViolation(change as Quad_Subject)),
      ).toBe(true);
    }
  });
});

const SH = 'http://www.w3.org/ns/shacl#';
const NDE_DATASET = 'https://def.nde.nl/dataset#';
const sh = (name: string) => DataFactory.namedNode(`${SH}${name}`);
const futureChange = DataFactory.namedNode('https://def.nde.nl#futureChange');

/**
 * Property shapes without constraints of their own, keyed as `describeShape` prints
 * them, with the shape that gives their warning. The SPARQL shape binds the path in
 * its query, which this test cannot read.
 */
const warnedAboutElsewhere: Record<string, string> = {
  [`${NDE_DATASET}AgentShape https://schema.org/contactPoint`]: `${NDE_DATASET}OrganizationContactPointRequiredShape`,
};

const constraintParameters = [
  'class',
  'datatype',
  'nodeKind',
  'minCount',
  'maxCount',
  'minExclusive',
  'minInclusive',
  'maxExclusive',
  'maxInclusive',
  'minLength',
  'maxLength',
  'pattern',
  'languageIn',
  'uniqueLang',
  'equals',
  'disjoint',
  'lessThan',
  'lessThanOrEquals',
  'not',
  'and',
  'or',
  'xone',
  'node',
  'qualifiedValueShape',
  'closed',
  'hasValue',
  'in',
  'sparql',
].map(sh);

const targetParameters = [
  'targetClass',
  'targetNode',
  'targetSubjectsOf',
  'targetObjectsOf',
].map(sh);

const store = new Store(
  new Parser().parse(readFileSync('../../requirements/shacl.ttl', 'utf8')),
);

function annotatedShapes() {
  return store.getQuads(null, futureChange, null, null).map((quad) => ({
    shape: quad.subject,
    change: quad.object as Quad_Subject,
  }));
}

function becomesViolation(change: Quad_Subject): boolean {
  return store.has(DataFactory.quad(change, sh('severity'), sh('Violation')));
}

function hasConstraint(shape: Quad_Subject): boolean {
  return constraintsOf(shape).length > 0;
}

function constraintsOf(subject: Quad_Subject) {
  return constraintParameters.flatMap((parameter) =>
    store.getQuads(subject, parameter, null, null),
  );
}

function warns(shape: Quad_Subject): boolean {
  return store.has(DataFactory.quad(shape, sh('severity'), sh('Warning')));
}

/**
 * Whether a shape that applies to the same nodes as `annotated` gives a warning for
 * `constraint` today. A restated constraint is found on the annotated shape itself.
 */
function warnedAbout(annotated: Quad_Subject, constraint: Quad): boolean {
  return store
    .getSubjects(constraint.predicate, constraint.object, null)
    .some(
      (candidate) =>
        warns(candidate) &&
        sameValue(candidate, annotated, sh('path')) &&
        targetParameters.every((target) =>
          sameValue(candidate, annotated, target),
        ),
    );
}

function sameValue(
  first: Quad_Subject,
  second: Quad_Subject,
  predicate: NamedNode,
): boolean {
  const values = (subject: Quad_Subject) =>
    store
      .getObjects(subject, predicate, null)
      .map((object) => object.value)
      .sort()
      .join(' ');
  return values(first) === values(second);
}

/** A named shape by its IRI; a blank property shape by its owner and path. */
function describeShape(shape: Quad_Subject): string {
  if (shape.termType === 'NamedNode') return shape.value;
  const owner = store.getSubjects(sh('property'), shape, null)[0]?.value;
  const path = store.getObjects(shape, sh('path'), null)[0]?.value;
  return `${owner} ${path}`;
}
