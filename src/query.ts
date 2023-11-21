import {BlankNode, NamedNode, Quad, Quad_Object, Term} from 'rdf-js';
import factory from 'rdf-ext';
import {BlankNodeScoped} from '@comunica/data-factory';

const dataset = 'dataset';
const identifier = 'identifier';
const name = 'name';
const alternateName = 'alternateName';
const description = 'description';
const license = 'license';
const creator = 'creator';
const publisher = 'publisher';
const distribution = 'distribution';
const dateCreated = 'dateCreated';
const datePublished = 'datePublished';
const dateModified = 'dateModified';
const language = 'language';
const source = 'source';
const keyword = 'keyword';
const mainEntityOfPage = 'mainEntityOfPage';
const version = 'version';
const includedInDataCatalog = 'includedInDataCatalog';

const creatorName = 'creator_name';
const creatorEmail = 'creator_email';
const creatorUrl = 'creator_url';
const creatorSameAs = 'creator_sameAs';

const publisherName = 'publisher_name';
const publisherEmail = 'publisher_email';
const publisherUrl = 'publisher_url';
const publisherSameAs = 'publisher_sameAs';

const distributionUrl = 'distribution_url';
const distributionMediaType = 'distribution_mediaType';
const distributionFormat = 'distribution_format';
const distributionDatePublished = 'distribution_datePublished';
const distributionDateModified = 'distribution_dateModified';
const distributionDescription = 'distribution_description';
const distributionLanguage = 'distribution_language';
const distributionLicense = 'distribution_license';
const distributionName = 'distribution_name';
const distributionSize = 'distribution_size';

export const dcat = (property: string): NamedNode =>
  factory.namedNode(`http://www.w3.org/ns/dcat#${property}`);
export const dct = (property: string): NamedNode =>
  factory.namedNode(`http://purl.org/dc/terms/${property}`);
export const foaf = (property: string): NamedNode =>
  factory.namedNode(`http://xmlns.com/foaf/0.1/${property}`);
const owl = (property: string): NamedNode =>
  factory.namedNode(`http://www.w3.org/2002/07/owl#${property}`);
export const rdf = (property: string): NamedNode =>
  factory.namedNode(`http://www.w3.org/1999/02/22-rdf-syntax-ns#${property}`);

// https://www.w3.org/TR/vocab-dcat-2/#Class:Dataset
const datasetMapping = new Map([
  [identifier, dct('identifier')],
  [name, dct('title')],
  [alternateName, dct('alternative')],
  [description, dct('description')],
  [license, dct('license')],
  [dateCreated, dct('created')],
  [datePublished, dct('issued')],
  [dateModified, dct('modified')],
  [language, dct('language')],
  [source, dct('source')],
  [keyword, dcat('keyword')],
  // [spatial, dct('spatial')],
  // [temporal, dct('temporal')],
  [mainEntityOfPage, dcat('landingPage')],
  [version, owl('versionInfo')],
  [includedInDataCatalog, dct('isPartOf')],
]);

export const creatorMapping = new Map([
  [creatorName, foaf('name')],
  [creatorEmail, foaf('mbox')],
  [creatorUrl, foaf('workplaceHomepage')],
  [creatorSameAs, owl('sameAs')],
]);

export const publisherMapping = new Map([
  [publisherName, foaf('name')],
  [publisherEmail, foaf('mbox')],
  [publisherUrl, foaf('workplaceHomepage')],
  [publisherSameAs, owl('sameAs')],
]);

// https://www.w3.org/TR/vocab-dcat-2/#Class:Distribution
const distributionMapping = new Map([
  [distributionUrl, dcat('accessURL')],
  [distributionMediaType, dcat('mediaType')],
  [distributionFormat, dct('format')],
  [distributionDatePublished, dct('issued')],
  [distributionDateModified, dct('modified')],
  [distributionDescription, dct('description')],
  [distributionLanguage, dct('language')],
  [distributionLicense, dct('license')],
  [distributionName, dct('title')],
  [distributionSize, dcat('byteSize')],
]);

export const datasetType = dcat('Dataset');
export const sparqlLimit = 50000;
export const selectQuery = `
  PREFIX dcat: <http://www.w3.org/ns/dcat#>
  PREFIX dct: <http://purl.org/dc/terms/>
  PREFIX foaf: <http://xmlns.com/foaf/0.1/>
  PREFIX schema: <https://schema.org/>
  PREFIX httpSchema: <http://schema.org/>
  SELECT * WHERE {
    {
      ${schemaOrgQuery('schema')}
    } UNION {
      ${schemaOrgQuery('httpSchema')}
    } UNION { 
      ?${dataset} a dcat:Dataset ;
        dct:title ?${name} ;
        dct:license ?${license} ;
        dct:publisher ?${publisher} .
        
      ?${publisher} a ?foafOrganizationOrPerson ;
        a ?publisherType ;
        foaf:name ?${publisherName} .
      
      OPTIONAL {
        ?${creator} a ?foafOrganizationOrPerson ;
          a ?creatorType ;
          foaf:name ?${creatorName} .
      }
        
      VALUES ?foafOrganizationOrPerson { foaf:Organization foaf:Person }

      OPTIONAL {  
        ?${dataset} dcat:distribution ?${distribution} .
        ?${distribution} a dcat:Distribution ;
          dcat:accessURL ?${distributionUrl} .
          
        OPTIONAL { ?${distribution} dct:format ?${distributionFormat} }
        OPTIONAL { ?${distribution} dcat:mediaType ?${distributionMediaType} }
        OPTIONAL { ?${distribution} dct:issued ?${distributionDatePublished} }
        OPTIONAL { ?${distribution} dct:modified ?${distributionDateModified} }
        OPTIONAL { ?${distribution} dct:description ?${distributionDescription} }
        OPTIONAL { ?${distribution} dct:language ?${distributionLanguage} }
        OPTIONAL { ?${distribution} dct:license ?${distributionLicense} }
        OPTIONAL { ?${distribution} dct:title ?${distributionName} }
        OPTIONAL { ?${distribution} dcat:byteSize ?${distributionSize} }
      }
        
      OPTIONAL { ?${dataset} dct:description ?${description} }
      OPTIONAL { ?${dataset} dct:identifier ?${identifier} }
      OPTIONAL { ?${dataset} dct:alternative ?${alternateName} }
      OPTIONAL { ?${dataset} dct:created ?${dateCreated} }
      OPTIONAL { ?${dataset} dct:issued ?${datePublished} }
      OPTIONAL { ?${dataset} dct:modified ?${dateModified} }
      OPTIONAL { ?${dataset} dct:language ?${language} }
      OPTIONAL { ?${dataset} dct:source ?${source} }
      OPTIONAL { ?${dataset} dcat:keyword ?${keyword} }
      OPTIONAL { ?${dataset} owl:versionInfo ?${version} }
      OPTIONAL { ?${dataset} dct:isPartOf ?${includedInDataCatalog} }
      OPTIONAL { ?${dataset} dcat:landingPage ?${mainEntityOfPage} }
    }
  } LIMIT ${sparqlLimit}`;

export function bindingsToQuads(binding: Map<string, Term>): Quad[] {
  const datasetIri = binding.get('dataset') as NamedNode;
  const quads = [
    factory.quad(datasetIri, rdf('type'), datasetType, datasetIri),
    ..._bindingsToQuads(datasetIri, binding, datasetMapping, datasetIri),
  ];

  if (binding.get(publisher)) {
    const publisherNode = binding.get(publisher) as NamedNode;
    quads.push(
      factory.quad(datasetIri, dct('publisher'), publisherNode, datasetIri),
      factory.quad(
        publisherNode,
        rdf('type'),
        organizationOrPersonToFoaf(
          (binding.get('publisherType') as NamedNode) || foaf('Organization')
        ),
        datasetIri
      ),
      ..._bindingsToQuads(publisherNode, binding, publisherMapping, datasetIri)
    );
  }

  if (binding.get(creator)) {
    const creatorNode = binding.get(creator) as NamedNode;
    quads.push(
      factory.quad(datasetIri, dct('creator'), creatorNode, datasetIri),
      factory.quad(
        creatorNode,
        rdf('type'),
        organizationOrPersonToFoaf(
          (binding.get('creatorType') as NamedNode) || foaf('Organization')
        ),
        datasetIri
      ),
      ..._bindingsToQuads(creatorNode, binding, creatorMapping, datasetIri)
    );
  }

  if (binding.get(distribution)) {
    const distributionBlankNode = binding.get(distribution) as BlankNodeScoped;
    quads.push(
      factory.quad(
        datasetIri,
        dcat('distribution'),
        distributionBlankNode,
        datasetIri
      ),
      factory.quad(
        distributionBlankNode,
        rdf('type'),
        dcat('Distribution'),
        datasetIri
      ),
      ..._bindingsToQuads(
        distributionBlankNode,
        binding,
        distributionMapping,
        datasetIri
      )
    );
  }

  return quads;
}

function _bindingsToQuads(
  subject: NamedNode | BlankNode,
  binding: Map<string, Term>,
  mapping: Map<string, NamedNode>,
  graphIri: NamedNode
): Quad[] {
  const quads: Quad[] = [];
  mapping.forEach((predicate, variable) => {
    if (binding.get(variable)) {
      quads.push(
        factory.quad(
          subject,
          predicate,
          binding.get(variable) as Quad_Object,
          graphIri
        )
      );
    }
  });

  return quads;
}

function schemaOrgQuery(prefix: string): string {
  return `
    ?${dataset} a ${prefix}:Dataset ;
      ${prefix}:name ?${name} ; 
      ${prefix}:license ?${license} .
      
    FILTER (!isBlank(?${license}))

    OPTIONAL { 
      ?${dataset} ${prefix}:creator ?${creator} .        
      ?${creator} a ?organizationOrPerson ;
        a ?creatorType ; 
        ${prefix}:name ?${creatorName} .
    }
      
    OPTIONAL { 
      ?${dataset} ${prefix}:publisher ?${publisher} .        
      ?${publisher} a ?organizationOrPerson ;
        a ?publisherType ;
        ${prefix}:name ?${publisherName} .
      OPTIONAL {
        ?${publisher} ${prefix}:contactPoint/${prefix}:email ?${publisherEmail} .  
      }
    }
    
    VALUES ?organizationOrPerson { ${prefix}:Organization ${prefix}:Person }  
        
    OPTIONAL {
      ?${dataset} ${prefix}:distribution ?${distribution} .
      ?${distribution} a ${prefix}:DataDownload ;
        ${prefix}:contentUrl ?${distributionUrl} ;
        ${prefix}:encodingFormat ?${distributionFormat} .
        
      OPTIONAL { ?${distribution} ${prefix}:fileFormat ?${distributionMediaType} }
      OPTIONAL { ?${distribution} ${prefix}:datePublished ?${distributionDatePublished} }
      OPTIONAL { ?${distribution} ${prefix}:dateModified ?${distributionDateModified} }
      OPTIONAL { ?${distribution} ${prefix}:description ?${distributionDescription} }
      OPTIONAL { ?${distribution} ${prefix}:inLanguage ?${distributionLanguage} }
      OPTIONAL { ?${distribution} ${prefix}:license ?${distributionLicense} }
      OPTIONAL { ?${distribution} ${prefix}:name ?${distributionName} }
      OPTIONAL { ?${distribution} ${prefix}:contentSize ?${distributionSize} }
    } 
     
    OPTIONAL { ?${dataset} ${prefix}:description ?${description} } 
    OPTIONAL { ?${dataset} ${prefix}:identifier ?${identifier} }
    OPTIONAL { ?${dataset} ${prefix}:alternateName ?${alternateName} }
    OPTIONAL { ?${dataset} ${prefix}:dateCreated ?${dateCreated} }
    OPTIONAL { ?${dataset} ${prefix}:datePublished ?${datePublished} }
    OPTIONAL { ?${dataset} ${prefix}:dateModified ?${dateModified} }
    OPTIONAL { ?${dataset} ${prefix}:inLanguage ?${language} }
    OPTIONAL { ?${dataset} ${prefix}:isBasedOn ?${source} }
    OPTIONAL { ?${dataset} ${prefix}:isBasedOnUrl ?${source} } 
    OPTIONAL { ?${dataset} ${prefix}:keywords ?${keyword} }
    OPTIONAL { ?${dataset} ${prefix}:version ?${version} }
    OPTIONAL { ?${dataset} ${prefix}:includedInDataCatalog ?${includedInDataCatalog} }
    OPTIONAL { ?${dataset} ${prefix}:mainEntityOfPage ?${mainEntityOfPage} }
`;
}

function organizationOrPersonToFoaf(type: NamedNode) {
  switch (type.value) {
    case 'http://schema.org/Person':
    case 'https://schema.org/Person':
      return foaf('Person');
    case 'http://schema.org/Organization':
    case 'https://schema.org/Organization':
      return foaf('Organization');
  }

  // Already in FOAF.
  return type;
}
