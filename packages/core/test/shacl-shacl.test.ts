import { readFileSync } from 'node:fs';
import { Parser } from 'n3';
import factory from 'rdf-ext';
import { Validator } from 'shacl-engine';
import type { DatasetCore, Term } from '@rdfjs/types';

/**
 * Validators may refuse a shapes graph that SHACL-for-SHACL rejects, as happened
 * with a restated sh:maxCount inside an nde:futureChange. Any node that carries a
 * constraint parameter counts as a shape there, annotations included.
 */
describe('requirements/shacl.ttl', () => {
  it('is a well-formed SHACL shapes graph', async () => {
    const shapes = load('../../requirements/shacl.ttl');
    const validator = new Validator(load('test/fixtures/shacl-shacl.ttl'), {
      factory,
    });
    const report = await validator.validate({ dataset: shapes });
    expect(describeResults(report.dataset, shapes)).toEqual([]);
    expect(report.conforms).toBe(true);
  });
});

const SH = 'http://www.w3.org/ns/shacl#';
const sh = (name: string): Term => factory.namedNode(`${SH}${name}`);

function load(path: string): DatasetCore {
  return factory.dataset(new Parser().parse(readFileSync(path, 'utf8')));
}

/**
 * Each result as its constraint component and the offending node. A blank node
 * is printed with its own triples, as its label means nothing outside this run.
 */
function describeResults(report: DatasetCore, shapes: DatasetCore): string[] {
  return [...report.match(null, sh('focusNode'))].map((result) => {
    const component = [
      ...report.match(result.subject, sh('sourceConstraintComponent')),
    ][0]?.object.value;
    return `${compact(component)} on ${describeNode(result.object, shapes)}`;
  });
}

function describeNode(node: Term, shapes: DatasetCore): string {
  if (node.termType !== 'BlankNode') return node.value;
  const triples = [...shapes.match(node)].map(
    (quad) => `${compact(quad.predicate.value)} ${compact(quad.object.value)}`,
  );
  return `[ ${triples.join('; ')} ]`;
}

function compact(iri: string | undefined): string {
  return iri?.startsWith(SH) ? `sh:${iri.slice(SH.length)}` : (iri ?? '');
}
