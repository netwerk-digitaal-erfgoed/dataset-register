import { createNamespace } from 'ldkit';

export const voidNs = createNamespace({
  iri: 'http://rdfs.org/ns/void#',
  prefix: 'void:',
  terms: ['Dataset', 'triples', 'distinctSubjects'],
} as const);
