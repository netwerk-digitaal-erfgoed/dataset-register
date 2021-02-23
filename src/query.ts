import {BlankNode, NamedNode, Quad, Quad_Object, Term} from 'rdf-js';
import factory from 'rdf-ext';
import {BlankNodeScoped} from '@comunica/data-factory';

const dataset = '?dataset';
const identifier = '?identifier';
const name = '?name';
const alternateName = '?alternateName';
const description = '?description';
const license = '?license';
const creator = '?creator';
const distribution = '?distribution';
const dateCreated = '?dateCreated';
const datePublished = '?datePublished';
const dateModified = '?dateModified';
const language = '?language';
const source = '$source';
const keyword = '?keyword';
const spatial = '?spatial';
const temporal = '?temporal';
const mainEntityOfPage = '?mainEntityOfPage';
const version = '?version';

const creatorName = '?creator_name';
const creatorEmail = '?creator_email';
const creatorUrl = '?creator_url';
const creatorSameAs = '?creator_sameAs';

const distributionUrl = '?distribution_url';
const distributionMediaType = '?distribution_mediaType';
const distributionFormat = '?distribution_format';
const distributionDatePublished = '?distribution_datePublished';
const distributionDateModified = '?distribution_dateModified';
const distributionDescription = '?distribution_description';
const distributionLanguage = '?distribution_language';
const distributionLicense = '?distribution_license';
const distributionName = '?distribution_name';
const distributionSize = '?distribution_size';

export const dcat = (property: string) =>
  factory.namedNode(`http://www.w3.org/ns/dcat#${property}`);
const dct = (property: string) =>
  factory.namedNode(`http://purl.org/dc/terms/${property}`);
const foaf = (property: string) =>
  factory.namedNode(`http://xmlns.com/foaf/0.1/${property}`);
const owl = (property: string) =>
  factory.namedNode(`http://www.w3.org/2002/07/owl#${property}`);
export const rdf = (property: string) =>
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
]);

export const creatorMapping = new Map([
  [creatorName, foaf('name')],
  [creatorEmail, foaf('mbox')],
  [creatorUrl, foaf('workplaceHomepage')],
  [creatorSameAs, owl('sameAs')],
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
export const selectQuery = `
  PREFIX dcat: <http://www.w3.org/ns/dcat#>
  PREFIX dct: <http://purl.org/dc/terms/>
  SELECT * WHERE {
    {
      ${dataset} a schema:Dataset ;
        schema:name ${name} ; 
        schema:license ${license} ;
        schema:creator ${creator} ;
        schema:distribution ${distribution} .
        
      FILTER (!isBlank(${license}))
        
      ${creator} a schema:Organization ;
        schema:name ${creatorName} .
        
      ${distribution} a schema:DataDownload ;
        schema:contentUrl ${distributionUrl} ;
        schema:encodingFormat ${distributionFormat} . 
       
      OPTIONAL { ${dataset} schema:description ${description} } 
      OPTIONAL { ${dataset} schema:identifier ${identifier} }
      OPTIONAL { ${dataset} schema:alternateName ${alternateName} }
      OPTIONAL { ${dataset} schema:dateCreated ${dateCreated} }
      OPTIONAL { ${dataset} schema:datePublished ${datePublished} }
      OPTIONAL { ${dataset} schema:dateModified ${dateModified} }
      OPTIONAL { ${dataset} schema:inLanguage ${language} }
      OPTIONAL { ${dataset} schema:isBasedOnUrl ${source} }
      OPTIONAL { ${dataset} schema:keyword ${keyword} }
      OPTIONAL { ${dataset} schema:version ${version} }
      OPTIONAL { ${dataset} schema:mainEntityOfPage ${mainEntityOfPage} }
      
      OPTIONAL { ${distribution} schema:fileFormat ${distributionMediaType} }
      OPTIONAL { ${distribution} schema:datePublished ${distributionDatePublished} }
      OPTIONAL { ${distribution} schema:dateModified ${distributionDateModified} }
      OPTIONAL { ${distribution} schema:description ${distributionDescription} }
      OPTIONAL { ${distribution} schema:inLanguage ${distributionLanguage} }
      OPTIONAL { ${distribution} schema:license ${distributionLicense} }
      OPTIONAL { ${distribution} schema:name ${distributionName} }
      OPTIONAL { ${distribution} schema:contentSize ${distributionSize} }
    } UNION { 
      ${dataset} a dcat:Dataset ;
        dct:title ${name} ;
        dct:license ${license} ;
        dct:creator ${creator} ;
        dcat:distribution ${distribution} .
        
      ${creator} a foaf:Organization ;
        foaf:name ${creatorName} .
        
      ${distribution} a dcat:Distribution ;
        dcat:accessURL ${distributionUrl} ;
        dct:format ${distributionFormat} .
        
      OPTIONAL { ${dataset} dct:description ${description} }
      OPTIONAL { ${dataset} dct:identifier ${identifier} }
      OPTIONAL { ${dataset} dct:alternative ${alternateName} }
      OPTIONAL { ${dataset} dct:created ${dateCreated} }
      OPTIONAL { ${dataset} dct:issued ${datePublished} }
      OPTIONAL { ${dataset} dct:modified ${dateModified} }
      OPTIONAL { ${dataset} dct:language ${language} }
      OPTIONAL { ${dataset} dct:source ${source} }
      OPTIONAL { ${dataset} dcat:keyword ${keyword} }
      OPTIONAL { ${dataset} owl:versionInfo ${version} }
      OPTIONAL { ${dataset} dcat:landingPage ${mainEntityOfPage} }
      
      OPTIONAL { ${distribution} dcat:mediaType ${distributionMediaType} }
      OPTIONAL { ${distribution} dct:issued ${distributionDatePublished} }
      OPTIONAL { ${distribution} dct:modified ${distributionDateModified} }
      OPTIONAL { ${distribution} dct:description ${distributionDescription} }
      OPTIONAL { ${distribution} dct:language ${distributionLanguage} }
      OPTIONAL { ${distribution} dct:license ${distributionLicense} }
      OPTIONAL { ${distribution} dct:title ${distributionName} }
      OPTIONAL { ${distribution} dcat:byteSize ${distributionSize} }
    }
  } LIMIT 10000`;

/**
 * Use skolemized values because they are correct, unlike the generated blank node ids.
 * See https://github.com/rubensworks/jsonld-streaming-parser.js/issues/72
 */
export function bindingsToQuads(binding: Map<string, Term>): Quad[] {
  const datasetIri = binding.get('?dataset') as NamedNode;
  const quads = [
    factory.quad(datasetIri, rdf('type'), datasetType, datasetIri),
    ..._bindingsToQuads(datasetIri, binding, datasetMapping, datasetIri),
  ];

  if (binding.get(creator)) {
    const creatorBlankNode = factory.blankNode(
      (binding.get(creator) as BlankNodeScoped).skolemized.value.replace(
        /:/g,
        '_'
      )
    );

    quads.push(
      factory.quad(datasetIri, dct('creator'), creatorBlankNode, datasetIri),
      factory.quad(
        creatorBlankNode,
        rdf('type'),
        foaf('Organization'),
        datasetIri
      ),
      ..._bindingsToQuads(creatorBlankNode, binding, creatorMapping, datasetIri)
    );
  }

  if (binding.get(distribution)) {
    const distributionBlankNode = factory.blankNode(
      (binding.get(distribution) as BlankNodeScoped).skolemized.value.replace(
        /:/g,
        '_'
      )
    );

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
