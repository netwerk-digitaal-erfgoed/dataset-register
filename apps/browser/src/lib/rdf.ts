import { createNamespace } from 'ldkit';

export const voidNs = createNamespace({
  iri: 'http://rdfs.org/ns/void#',
  prefix: 'void:',
  terms: [
    'Dataset',
    'triples',
    'distinctSubjects',
    'distinctObjects',
    'properties',
    'property',
    'classPartition',
    'propertyPartition',
    'class',
    'property',
    'entities',
    'vocabulary',
    'Linkset',
    'subjectsTarget',
    'objectsTarget',
    'dataDump',
    'sparqlEndpoint',
  ],
} as const);

export const ndeNs = createNamespace({
  iri: 'https://www.netwerkdigitaalerfgoed.nl/def#',
  prefix: 'nde:',
  terms: [
    'objectsLiteral',
    'distinctObjectsLiteral',
    'objectsURI',
    'distinctObjectsURI',
  ],
} as const);

export const owlNs = createNamespace({
  iri: 'http://www.w3.org/2002/07/owl#',
  prefix: 'owl:',
  terms: ['sameAs'],
} as const);

export const voidExtNs = createNamespace({
  iri: 'http://ldf.fi/void-ext#',
  prefix: 'void-ext:',
  terms: [
    'datatypePartition',
    'datatype',
    'objectClassPartition',
    'languagePartition',
    'language',
  ],
} as const);
