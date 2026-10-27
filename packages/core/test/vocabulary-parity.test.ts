import { readFileSync } from 'node:fs';
import { DataFactory, Parser, Store } from 'n3';
import type { Quad_Object, Quad_Subject, Term } from '@rdfjs/types';

/**
 * Publishers may describe their datasets in Schema.org or in DCAT, and the
 * Register reads both into one model. A property must therefore be held to the
 * same rules in either vocabulary, or the choice of vocabulary decides which
 * mistakes the validator lets through, and the two spec tabs disagree.
 *
 * Each pair below maps a Schema.org property to the DCAT property that
 * `query.ts` reads in its place. Their constraints, with severity and announced
 * v2.0 change, must be equal except for the differences listed with a reason.
 */
describe('Schema.org and DCAT shapes', () => {
  it('hold each property to the same rules in both vocabularies', () => {
    const unexpected = pairs.flatMap((pair) => {
      const key = describePair(pair);
      const schemaConstraints = constraintsOn(pair.schema);
      const dcatConstraints = constraintsOn(pair.dcat);
      const allowed = intendedDifferences[key];
      const schemaOnly = difference(schemaConstraints, dcatConstraints);
      const dcatOnly = difference(dcatConstraints, schemaConstraints);
      const expectedSchemaOnly = [...(allowed?.schemaOnly ?? [])].sort();
      const expectedDcatOnly = [...(allowed?.dcatOnly ?? [])].sort();
      if (
        schemaOnly.join('\n') === expectedSchemaOnly.join('\n') &&
        dcatOnly.join('\n') === expectedDcatOnly.join('\n')
      ) {
        return [];
      }
      return [{ pair: key, schemaOnly, dcatOnly }];
    });
    expect(unexpected).toEqual([]);
  });

  it('lists intended differences only for compared pairs', () => {
    const compared = pairs.map(describePair);
    expect(
      Object.keys(intendedDifferences).filter((key) => !compared.includes(key)),
    ).toEqual([]);
  });
});

interface Side {
  shape: string;
  path?: string;
}

interface Pair {
  schema: Side;
  dcat: Side;
}

interface IntendedDifference {
  reason: string;
  schemaOnly?: string[];
  dcatOnly?: string[];
}

const SH = 'http://www.w3.org/ns/shacl#';
const NDE = 'https://def.nde.nl#';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const sh = (name: string) => DataFactory.namedNode(`${SH}${name}`);

const prefixes: Record<string, string> = {
  'sh:': SH,
  'schema:': 'https://schema.org/',
  'dcat:': 'http://www.w3.org/ns/dcat#',
  'dct:': 'http://purl.org/dc/terms/',
  'foaf:': 'http://xmlns.com/foaf/0.1/',
  'vcard:': 'http://www.w3.org/2006/vcard/ns#',
  'owl:': 'http://www.w3.org/2002/07/owl#',
  'xsd:': 'http://www.w3.org/2001/XMLSchema#',
  'rdf:': RDF,
  'nde-dataset:': 'https://def.nde.nl/dataset#',
};

const expand = (curie: string) => {
  const prefix = Object.keys(prefixes).find((candidate) =>
    curie.startsWith(candidate),
  );
  return prefix ? prefixes[prefix] + curie.slice(prefix.length) : curie;
};

const compact = (iri: string) => {
  const prefix = Object.keys(prefixes).find((candidate) =>
    iri.startsWith(prefixes[candidate]),
  );
  return prefix ? prefix + iri.slice(prefixes[prefix].length) : iri;
};

/** Classes that name the same thing in both vocabularies. */
const equivalentClasses: Record<string, string> = {
  'schema:Dataset': 'dcat:Dataset',
  'schema:DataDownload': 'dcat:Distribution',
};

const pair = (
  schemaShape: string,
  schemaPath: string | undefined,
  dcatShape: string,
  dcatPath: string | undefined,
): Pair => ({
  schema: { shape: schemaShape, path: schemaPath },
  dcat: { shape: dcatShape, path: dcatPath },
});

const catalog = (schemaPath?: string, dcatPath?: string) =>
  pair(
    'nde-dataset:DatacatalogShape',
    schemaPath,
    'dcat:CatalogShape',
    dcatPath,
  );
const dataset = (schemaPath?: string, dcatPath?: string) =>
  pair('nde-dataset:DatasetShape', schemaPath, 'dcat:DatasetShape', dcatPath);
const distribution = (schemaPath?: string, dcatPath?: string) =>
  pair(
    'nde-dataset:DistributionShape',
    schemaPath,
    'dcat:DistributionShape',
    dcatPath,
  );
const agent = (schemaPath?: string, dcatPath?: string) =>
  pair('nde-dataset:AgentShape', schemaPath, 'dcat:AgentShape', dcatPath);
const contactPoint = (schemaPath?: string, dcatPath?: string) =>
  pair(
    'nde-dataset:ContactPointShape',
    schemaPath,
    'dcat:ContactPointShape',
    dcatPath,
  );

const pairs: Pair[] = [
  catalog('schema:name', 'dct:title'),
  catalog('schema:description', 'dct:description'),
  catalog('schema:publisher', 'dct:publisher'),
  catalog('schema:dataset', 'dcat:dataset'),
  catalog(undefined, 'dcat:contactPoint'),
  dataset('schema:name', 'dct:title'),
  dataset('schema:description', 'dct:description'),
  dataset('schema:publisher', 'dct:publisher'),
  dataset('schema:creator', 'dct:creator'),
  dataset('schema:license', undefined),
  dataset(undefined, 'dcat:contactPoint'),
  dataset('schema:distribution', 'dcat:distribution'),
  dataset('schema:datePublished', 'dct:issued'),
  dataset('schema:dateCreated', 'dct:created'),
  dataset('schema:dateModified', 'dct:modified'),
  dataset('schema:version', 'dcat:version'),
  dataset('schema:inLanguage', 'dct:language'),
  dataset('schema:mainEntityOfPage', 'dcat:landingPage'),
  dataset('schema:isBasedOn', 'dct:source'),
  dataset('schema:citation', 'dct:isReferencedBy'),
  dataset('schema:about', 'dcat:theme'),
  dataset('schema:genre', undefined),
  dataset('schema:spatialCoverage', 'dct:spatial'),
  dataset('schema:temporalCoverage', 'dct:temporal'),
  dataset('schema:hasPart', 'dct:hasPart'),
  dataset('schema:includedInDataCatalog', 'dct:isPartOf'),
  dataset('dct:accrualPeriodicity', 'dct:accrualPeriodicity'),
  dataset('dct:accessRights', 'dct:accessRights'),
  distribution('schema:contentUrl', 'dcat:accessURL'),
  distribution('schema:contentUrl', 'dcat:downloadURL'),
  distribution('schema:encodingFormat', 'dcat:mediaType'),
  distribution(undefined, 'dct:format'),
  distribution(undefined, 'dcat:compressFormat'),
  distribution('schema:name', 'dct:title'),
  distribution('schema:description', 'dct:description'),
  distribution('schema:datePublished', 'dct:issued'),
  distribution('schema:dateModified', 'dct:modified'),
  distribution('schema:inLanguage', 'dct:language'),
  distribution('schema:license', 'dct:license'),
  distribution('schema:contentSize', 'dcat:byteSize'),
  distribution('schema:usageInfo', 'dct:conformsTo'),
  distribution('schema:documentation', 'foaf:page'),
  agent('schema:name', 'foaf:name'),
  agent('schema:alternateName', 'foaf:nick'),
  agent('schema:identifier', 'dct:identifier'),
  agent('schema:sameAs', 'owl:sameAs'),
  agent('schema:contactPoint', undefined),
  contactPoint('schema:name', 'vcard:fn'),
  contactPoint('schema:email', 'vcard:hasEmail'),
];

const futureViolation = 'Warning, v2.0: Violation';

/**
 * Differences that follow from how the two vocabularies model a property, keyed
 * as `describePair` prints the pair. Anything else is a rule that one vocabulary
 * forgot.
 */
const intendedDifferences: Record<string, IntendedDifference> = {
  'nde-dataset:DatacatalogShape schema:publisher ↔ dcat:CatalogShape dct:publisher':
    {
      reason: 'FOAF has a generic foaf:Agent class that Schema.org lacks.',
      schemaOnly: [
        `or([class=schema:Organization] | [class=schema:Person]) (${futureViolation})`,
      ],
      dcatOnly: [
        `or([class=foaf:Organization] | [class=foaf:Person] | [class=foaf:Agent]) (${futureViolation})`,
      ],
    },
  'nde-dataset:DatacatalogShape (none) ↔ dcat:CatalogShape dcat:contactPoint': {
    reason:
      'Schema.org has no contact point on a DataCatalog; it sits on the publishing organization.',
    dcatOnly: [
      `maxCount=1 (${futureViolation})`,
      `minCount=1 (${futureViolation})`,
    ],
  },
  'nde-dataset:DatasetShape schema:publisher ↔ dcat:DatasetShape dct:publisher':
    {
      reason: 'FOAF has a generic foaf:Agent class that Schema.org lacks.',
      schemaOnly: [
        'or([class=schema:Organization] | [class=schema:Person]) (Violation)',
      ],
      dcatOnly: [
        'or([class=foaf:Organization] | [class=foaf:Person] | [class=foaf:Agent]) (Violation)',
      ],
    },
  'nde-dataset:DatasetShape schema:creator ↔ dcat:DatasetShape dct:creator': {
    reason: 'FOAF has a generic foaf:Agent class that Schema.org lacks.',
    schemaOnly: [
      `or([class=schema:Organization] | [class=schema:Person]) (${futureViolation})`,
    ],
    dcatOnly: [
      `or([class=foaf:Organization] | [class=foaf:Person] | [class=foaf:Agent]) (${futureViolation})`,
    ],
  },
  'nde-dataset:DatasetShape schema:license ↔ dcat:DatasetShape (none)': {
    reason:
      'DCAT-AP-NL puts dct:license on the distribution, where dcat:DistributionShape checks it.',
    schemaOnly: [
      'in(<http://creativecommons.org/licenses/by-nc-nd/4.0/> <http://creativecommons.org/licenses/by-nc-sa/4.0/> <http://creativecommons.org/licenses/by-nc/4.0/> <http://creativecommons.org/licenses/by-nd/4.0/> <http://creativecommons.org/licenses/by-sa/4.0/> <http://creativecommons.org/licenses/by/4.0/> <http://creativecommons.org/publicdomain/mark/1.0/> <http://creativecommons.org/publicdomain/zero/1.0/> <https://creativecommons.org/licenses/by-nc-nd/4.0/> <https://creativecommons.org/licenses/by-nc-sa/4.0/> <https://creativecommons.org/licenses/by-nc/4.0/> <https://creativecommons.org/licenses/by-nd/4.0/> <https://creativecommons.org/licenses/by-sa/4.0/> <https://creativecommons.org/licenses/by/4.0/> <https://creativecommons.org/publicdomain/mark/1.0/> <https://creativecommons.org/publicdomain/zero/1.0/>) (' +
        futureViolation +
        ')',
      'maxCount=1 (Warning)',
      'minCount=1 (Violation)',
      'node=nde-dataset:LicenseCreativeCommonsTrailingSlashShape (Warning)',
      'node=nde-dataset:LicenseNotOpenDefinitionShape (Warning)',
      'node=nde-dataset:LicenseOpenDataCommonsShape (Warning)',
      `nodeKind=sh:IRI (${futureViolation})`,
    ],
  },
  'nde-dataset:DatasetShape (none) ↔ dcat:DatasetShape dcat:contactPoint': {
    reason:
      'Schema.org has no contact point on a Dataset; it sits on the publishing organization.',
    dcatOnly: [
      `maxCount=1 (${futureViolation})`,
      `minCount=1 (${futureViolation})`,
    ],
  },
  'nde-dataset:DatasetShape schema:inLanguage ↔ dcat:DatasetShape dct:language':
    {
      reason:
        'Schema.org takes a BCP 47 language code; DCAT-AP-NL takes an IRI from the EU language authority list.',
      schemaOnly: [
        'pattern=^[a-zA-Z]{2,3}(-[a-zA-Z0-9]+)*$ (Warning, v2.0: Violation, pattern=^[a-zA-Z]{2,3}(-[a-zA-Z0-9]+)*$)',
      ],
      dcatOnly: [
        `node=[nodeKind=sh:IRI; pattern=^http://publications\\.europa\\.eu/resource/authority/language/] (${futureViolation})`,
      ],
    },
  'nde-dataset:DatasetShape schema:about ↔ dcat:DatasetShape dcat:theme': {
    reason:
      'The Register assigns the default theme data-theme/EDUC to every DCAT dataset, so a missing dcat:theme needs no recommendation.',
    schemaOnly: ['minCount=1 (Info)'],
  },
  'nde-dataset:DatasetShape schema:genre ↔ dcat:DatasetShape (none)': {
    reason:
      'schema:genre is deprecated in favour of schema:about; DCAT has no counterpart.',
    schemaOnly: [`maxCount=0 (${futureViolation})`],
  },
  'nde-dataset:DatasetShape schema:temporalCoverage ↔ dcat:DatasetShape dct:temporal':
    {
      reason: 'DCAT can also describe a period as a dct:PeriodOfTime node.',
      schemaOnly: [
        'or([nodeKind=sh:IRI; pattern=^https?://] | [pattern=^(-?\\d{4,}(-\\d{2}(-\\d{2}(T\\d{2}:\\d{2}(:\\d{2})?)?)?)?|\\.\\.)(/(-?\\d{4,}(-\\d{2}(-\\d{2}(T\\d{2}:\\d{2}(:\\d{2})?)?)?)?|\\d{2}(-\\d{2})?|\\.\\.))?$]) (' +
          futureViolation +
          ')',
      ],
      dcatOnly: [
        'or([nodeKind=sh:IRI; pattern=^https?://] | [pattern=^(-?\\d{4,}(-\\d{2}(-\\d{2}(T\\d{2}:\\d{2}(:\\d{2})?)?)?)?|\\.\\.)(/(-?\\d{4,}(-\\d{2}(-\\d{2}(T\\d{2}:\\d{2}(:\\d{2})?)?)?)?|\\d{2}(-\\d{2})?|\\.\\.))?$] | [class=dct:PeriodOfTime]) (' +
          futureViolation +
          ')',
      ],
    },
  'nde-dataset:DistributionShape schema:contentUrl ↔ dcat:DistributionShape dcat:accessURL':
    {
      reason:
        'DCAT splits schema:contentUrl into dcat:accessURL and dcat:downloadURL, of which a distribution needs one.',
      schemaOnly: ['maxCount=1 (Violation)', 'minCount=1 (Violation)'],
      dcatOnly: [
        'alternative maxCount=1 (Violation)',
        'alternative minCount=1 (Violation)',
      ],
    },
  'nde-dataset:DistributionShape schema:contentUrl ↔ dcat:DistributionShape dcat:downloadURL':
    {
      reason:
        'DCAT splits schema:contentUrl into dcat:accessURL and dcat:downloadURL, of which a distribution needs one.',
      schemaOnly: ['maxCount=1 (Violation)', 'minCount=1 (Violation)'],
      dcatOnly: [
        'alternative maxCount=1 (Violation)',
        'alternative minCount=1 (Violation)',
      ],
    },
  'nde-dataset:DistributionShape schema:encodingFormat ↔ dcat:DistributionShape dcat:mediaType':
    {
      reason:
        'dcat:mediaType is an IANA media type IRI rather than a type/subtype string, and DCAT declares compression in dcat:compressFormat rather than in the media type.',
      schemaOnly: [
        'maxCount=1 (Warning, v2.0: Violation, maxCount=1)',
        `not=[in(application/gzip application/x-gzip application/x-zip-compressed application/zip)] (${futureViolation})`,
        `not=[pattern=^[a-zA-Z]+/x-] (${futureViolation})`,
        'pattern=^[a-zA-Z]+/[a-zA-Z0-9][a-zA-Z0-9!#$&\\-^_.+]*$ (Violation)',
      ],
      dcatOnly: [
        `maxCount=1 (${futureViolation})`,
        `not=[pattern=^(https?://www\\.iana\\.org/assignments/media-types/)?[a-zA-Z]+/x-] (${futureViolation})`,
      ],
    },
  'nde-dataset:DistributionShape (none) ↔ dcat:DistributionShape dct:format': {
    reason: 'DCAT accepts dct:format in place of dcat:mediaType.',
    dcatOnly: ['alternative minCount=1 (Violation)'],
  },
  'nde-dataset:DistributionShape schema:inLanguage ↔ dcat:DistributionShape dct:language':
    {
      reason:
        'Schema.org takes a BCP 47 language code; DCAT-AP-NL takes an IRI from the EU language authority list.',
      schemaOnly: [
        'pattern=^[a-zA-Z]{2,3}(-[a-zA-Z0-9]+)*$ (Warning, v2.0: Violation, pattern=^[a-zA-Z]{2,3}(-[a-zA-Z0-9]+)*$)',
      ],
      dcatOnly: [
        `node=[nodeKind=sh:IRI; pattern=^http://publications\\.europa\\.eu/resource/authority/language/] (${futureViolation})`,
      ],
    },
  'nde-dataset:DistributionShape schema:license ↔ dcat:DistributionShape dct:license':
    {
      reason:
        'DCAT-AP-NL requires a license on each distribution; Schema.org requires it on the dataset, which its distributions inherit.',
      schemaOnly: ['maxCount=1 (Warning)'],
      dcatOnly: [
        `maxCount=1 (${futureViolation})`,
        `minCount=1 (${futureViolation})`,
      ],
    },
  'nde-dataset:AgentShape schema:identifier ↔ dcat:AgentShape dct:identifier': {
    reason:
      'Schema.org can type an identifier as a schema:PropertyValue; DCAT-AP-NL uses a plain literal.',
    schemaOnly: [
      'or([datatype=xsd:string] | [class=schema:PropertyValue]) (Warning)',
    ],
    dcatOnly: ['datatype=xsd:string (Warning)'],
  },
  'nde-dataset:ContactPointShape schema:email ↔ dcat:ContactPointShape vcard:hasEmail':
    {
      reason: 'schema:email is text; vcard:hasEmail is a mailto: IRI.',
      dcatOnly: [
        `nodeKind=sh:IRI (${futureViolation})`,
        `pattern=^mailto: (${futureViolation})`,
      ],
    },
};

const store = new Store(
  new Parser().parse(readFileSync('../../requirements/shacl.ttl', 'utf8')),
);

function describePair({ schema, dcat }: Pair): string {
  return `${schema.shape} ${schema.path ?? '(none)'} ↔ ${dcat.shape} ${dcat.path ?? '(none)'}`;
}

/** Every constraint on the path, flattened so that grouping into shapes does not matter. */
function constraintsOn({ shape, path }: Side): string[] {
  if (path === undefined) return [];
  const nodeShape = DataFactory.namedNode(expand(shape));
  const direct = store
    .getObjects(nodeShape, sh('property'), null)
    .map((propertyShape) => ({ propertyShape, alternative: false }));
  const alternatives = store
    .getObjects(nodeShape, sh('or'), null)
    .flatMap((list) => listItems(list))
    .flatMap((member) => store.getObjects(member, sh('property'), null))
    .map((propertyShape) => ({ propertyShape, alternative: true }));
  return [...direct, ...alternatives]
    .filter(({ propertyShape }) =>
      store
        .getObjects(propertyShape, sh('path'), null)
        .some((value) => value.value === expand(path)),
    )
    .flatMap(({ propertyShape, alternative }) =>
      atomsOf(propertyShape as Quad_Subject).map((atom) =>
        alternative ? `alternative ${atom}` : atom,
      ),
    )
    .map(normalizeClasses)
    .sort();
}

const ignoredPredicates = [
  'path',
  'description',
  'message',
  'name',
  'severity',
].map((name) => SH + name);

function atomsOf(propertyShape: Quad_Subject): string[] {
  const severity = compact(
    store.getObjects(propertyShape, sh('severity'), null)[0]?.value ??
      `${SH}Violation`,
  ).replace('sh:', '');
  const change = store.getObjects(propertyShape, `${NDE}futureChange`, null)[0];
  const qualifier = change
    ? `${severity}, v2.0: ${describeChange(change as Quad_Subject)}`
    : severity;
  const constraints = store
    .getQuads(propertyShape, null, null, null)
    .filter(
      (quad) =>
        quad.predicate.value.startsWith(SH) &&
        !ignoredPredicates.includes(quad.predicate.value),
    )
    .map((quad) => describeConstraint(quad.predicate, quad.object))
    // sh:minCount 0 documents an optional property but constrains nothing.
    .filter((constraint) => constraint !== 'minCount=0');
  return constraints.map((constraint) => `${constraint} (${qualifier})`);
}

function describeChange(change: Quad_Subject): string {
  return store
    .getQuads(change, null, null, null)
    .filter((quad) => quad.predicate.value !== `${NDE}version`)
    .map((quad) =>
      quad.predicate.value === `${SH}severity`
        ? compact(quad.object.value).replace('sh:', '')
        : describeConstraint(quad.predicate, quad.object),
    )
    .sort((first, second) =>
      first === 'Violation'
        ? -1
        : second === 'Violation'
          ? 1
          : first.localeCompare(second),
    )
    .join(', ');
}

function describeConstraint(predicate: Term, object: Quad_Object): string {
  const name = compact(predicate.value).replace('sh:', '');
  if (name === 'or' || name === 'in') {
    const items = listItems(object).map(describeValue);
    return name === 'in'
      ? `in(${items.sort().join(' ')})`
      : `or(${items.join(' | ')})`;
  }
  return `${name}=${describeValue(object)}`;
}

function describeValue(term: Term): string {
  if (term.termType === 'BlankNode') {
    const constraints = store
      .getQuads(term, null, null, null)
      .map((quad) => describeConstraint(quad.predicate, quad.object))
      .sort();
    return `[${constraints.join('; ')}]`;
  }
  if (term.termType === 'Literal') return term.value;
  const compacted = compact(term.value);
  return compacted === term.value ? `<${term.value}>` : compacted;
}

function listItems(head: Term): Term[] {
  const items: Term[] = [];
  let node = head;
  while (node.value !== `${RDF}nil`) {
    items.push(store.getObjects(node, `${RDF}first`, null)[0]);
    node = store.getObjects(node, `${RDF}rest`, null)[0];
  }
  return items;
}

function normalizeClasses(atom: string): string {
  return Object.entries(equivalentClasses).reduce(
    (normalized, [schemaClass, dcatClass]) =>
      normalized.replaceAll(`class=${schemaClass}`, `class=${dcatClass}`),
    atom,
  );
}

function difference(first: string[], second: string[]): string[] {
  const remaining = [...second];
  return first.filter((item) => {
    const index = remaining.indexOf(item);
    if (index === -1) return true;
    remaining.splice(index, 1);
    return false;
  });
}
