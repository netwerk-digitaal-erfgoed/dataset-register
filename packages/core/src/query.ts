import factory from 'rdf-ext';
import {
  convertToIri,
  convertToXsdDate,
  normalizeByteSize,
  normalizeLicense,
  normalizeMediaType,
} from './literal.ts';
import type { NamedNode } from '@rdfjs/types';

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
const spatialCoverage = 'spatialCoverage';
const temporalCoverage = 'temporalCoverage';
const genre = 'genre';
const mainEntityOfPage = 'mainEntityOfPage';
const version = 'version';
const includedInDataCatalog = 'includedInDataCatalog';
const hasPart = 'hasPart';
const isReferencedBy = 'isReferencedBy';

const creatorName = 'creator_name';
const creatorType = 'creator_type';

const publisherType = 'publisher_type';
const publisherName = 'publisher_name';
const publisherEmail = 'publisher_email';
const publisherIdentifier = 'publisher_identifier';
const publisherAlternateName = 'publisher_alternate_name';
const publisherSameAs = 'publisher_sameAs';

const distributionUrl = 'distribution_url';
const distributionMediaType = 'distribution_mediaType';
const distributionConformsTo = 'distribution_conformsTo';
const distributionConformsToSparql = 'distribution_conformsTo_sparql';
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
export const rdf = (property: string): NamedNode =>
  factory.namedNode(`http://www.w3.org/1999/02/22-rdf-syntax-ns#${property}`);

export const datasetType = dcat('Dataset');
export const sparqlLimit = 1_000_000;

export const constructQuery = `
  PREFIX dcat: <http://www.w3.org/ns/dcat#>
  PREFIX dct: <http://purl.org/dc/terms/>
  PREFIX foaf: <http://xmlns.com/foaf/0.1/>
  PREFIX owl: <http://www.w3.org/2002/07/owl#>
  PREFIX schema: <https://schema.org/>
  PREFIX httpSchema: <http://schema.org/>
  PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

  CONSTRUCT {
    ?${dataset} a dcat:Dataset ;
      dct:title ?${name} ;
      dct:alternative ?${alternateName} ;
      dct:description ?${description} ;
      dct:identifier ?${identifier} ;
      dct:license ?${license} ;
      dct:created ?${dateCreated} ;
      dct:issued ?${datePublished} ;
      dct:modified ?${dateModified} ;
      dct:language ?${language} ;
      dct:source ?${source} ;
      dcat:keyword ?${keyword} ;
      dcat:landingPage ?${mainEntityOfPage} ;
      dct:spatial ?${spatialCoverage} ;
      dct:temporal ?${temporalCoverage} ;
      dct:type ?${genre} ;
      owl:versionInfo ?${version} ;
      dct:isPartOf ?${includedInDataCatalog} ;
      dct:hasPart ?${hasPart} ;
      dct:isReferencedBy ?${isReferencedBy} ;
      dct:publisher ?${publisher} ;
      dct:creator ?${creator} ;
      dcat:distribution ?${distribution} .
      
    ?${publisher} a ?${publisherType} ;
      foaf:name ?${publisherName} ;
      foaf:nick ?${publisherAlternateName} ;
      dct:identifier ?${publisherIdentifier} ;
      foaf:mbox ?${publisherEmail} ;
      owl:sameAs ?${publisherSameAs} .

    ?${creator} a ?${creatorType} ;
      foaf:name ?${creatorName} .
      
    ?${distribution} a dcat:Distribution ;
      dcat:accessURL ?${distributionUrl} ;
      dcat:mediaType ?${distributionMediaType} ;
      dct:conformsTo ?${distributionConformsTo} ;
      dct:conformsTo ?${distributionConformsToSparql} ;
      dct:issued ?${distributionDatePublished} ;
      dct:modified ?${distributionDateModified} ;
      dct:description ?${distributionDescription} ;
      dct:language ?${distributionLanguage} ;
      dct:license ?${distributionLicense} ;
      dct:title ?${distributionName} ;
      dcat:byteSize ?${distributionSize} .
  } WHERE {
    SELECT * WHERE {
      {
        ${schemaOrgQuery('schema')}
      } UNION {
        ${schemaOrgQuery('httpSchema')}
      } UNION { 
        ?${dataset} a dcat:Dataset ;
          dct:title ?${name} ;
          dct:publisher ?${publisher} ;
          dct:license ${normalizeLicense(license)} .
          
        ?${publisher} a ?foafOrganizationOrPerson ;
          a ?${publisherType} ;
          foaf:name ?${publisherName} .
          
        OPTIONAL { ?${publisher} foaf:nick ?${publisherAlternateName} ; }
        OPTIONAL { ?${publisher} dct:identifier ?${publisherIdentifier} ; }
        OPTIONAL { ?${publisher} foaf:mbox ?${publisherEmail} ; }
        OPTIONAL { ?${publisher} owl:sameAs ?${publisherSameAs} ; }
        
        OPTIONAL {
          ?${creator} a ?foafOrganizationOrPerson ;
            a ?${creatorType} ;
            foaf:name ?${creatorName} .
        }
          
        VALUES ?foafOrganizationOrPerson { foaf:Organization foaf:Person }
  
        OPTIONAL {
          ?${dataset} dcat:distribution ?${distribution} .
          ?${distribution} a dcat:Distribution .
          ?${distribution} dcat:mediaType ${normalizeMediaType(distributionMediaType)} .
          ?${distribution} dcat:accessURL ${convertToIri(distributionUrl)} .
          OPTIONAL { ?${distribution} dct:conformsTo ?${distributionConformsTo} . }
          BIND(
            IF(
              CONTAINS(STR(?${distributionMediaType}), "sparql"),
              <https://www.w3.org/TR/sparql11-protocol/>,
              ?unbound
            ) AS ?${distributionConformsToSparql} 
          )            
          OPTIONAL { ?${distribution} dct:issued ${convertToXsdDate(
            distributionDatePublished,
          )} }
          OPTIONAL { ?${distribution} dct:modified ${convertToXsdDate(
            distributionDateModified,
          )} }
          OPTIONAL { ?${distribution} dct:description ?${distributionDescription} }
          OPTIONAL { ?${distribution} dct:language ?${distributionLanguage} }
          OPTIONAL { ?${distribution} dct:license ${normalizeLicense(distributionLicense)} }
          OPTIONAL { ?${distribution} dct:title ?${distributionName} }
          OPTIONAL { ?${distribution} dcat:byteSize ${normalizeByteSize(distributionSize)} }
        }
          
        OPTIONAL { ?${dataset} dct:description ?${description} }
        OPTIONAL { ?${dataset} dct:identifier ?${identifier} }
        OPTIONAL { ?${dataset} dct:alternative ?${alternateName} }
        OPTIONAL { ?${dataset} dct:created ${convertToXsdDate(dateCreated)} }
        OPTIONAL { ?${dataset} dct:issued ${convertToXsdDate(datePublished)} }
        OPTIONAL { ?${dataset} dct:modified ${convertToXsdDate(dateModified)} }
        OPTIONAL { ?${dataset} dct:language ?${language} }
        OPTIONAL { ?${dataset} dct:source ?${source} }
        OPTIONAL { ?${dataset} dcat:keyword ?${keyword} }
        OPTIONAL {
          ?${dataset} dct:spatial ?${spatialCoverage} .
          FILTER(!isBlank(?${spatialCoverage}))
        }
        OPTIONAL { ?${dataset} dct:temporal ?${temporalCoverage} }
        OPTIONAL { 
          ?${dataset} dct:genre ?${genre}
          FILTER(isLiteral(?${genre}))
        }
        OPTIONAL { ?${dataset} owl:versionInfo ?${version} }
        OPTIONAL { ?${dataset} dct:isPartOf ?${includedInDataCatalog} }
        OPTIONAL { ?${dataset} dct:hasPart ?${hasPart} }
        OPTIONAL { ?${dataset} dct:isReferencedBy ?${isReferencedBy} }
        OPTIONAL { ?${dataset} dcat:landingPage ?${mainEntityOfPage} }
      }
    }
    LIMIT ${sparqlLimit}
  }`;

function schemaOrgQuery(prefix: string): string {
  return `
    ?${dataset} a ${prefix}:Dataset ;
      ${prefix}:name ?${name} ; 
      ${prefix}:license ${normalizeLicense(license)} .

    OPTIONAL { 
      ?${dataset} ${prefix}:creator ?${creator} .        
      ?${creator} a ?creatorTypeRaw ;
        ${prefix}:name ?${creatorName} .
      BIND(
        IF(
          ?creatorTypeRaw = ${prefix}:Organization,
          foaf:Organization,
          IF(
            ?creatorTypeRaw = ${prefix}:Person,
            foaf:Person,
            ""
          )
        )
      AS ?${creatorType})
      FILTER(?${creatorType} != "")
    }
      
    OPTIONAL { 
      ?${dataset} ${prefix}:publisher ?${publisher} .
      ?${publisher} a ?publisherTypeRaw ;
        ${prefix}:name ?${publisherName} .
      OPTIONAL { ?${publisher} ${prefix}:alternateName ?${publisherAlternateName} . }
      OPTIONAL { ?${publisher} ${prefix}:identifier ?${publisherIdentifier} . }
      OPTIONAL { 
        ?${publisher} ${prefix}:sameAs ?${publisherSameAs} .
        FILTER(isIRI(?${publisherSameAs}))
      }
      BIND(
        IF(
          ?publisherTypeRaw = ${prefix}:Organization,
          foaf:Organization,
          IF(
            ?publisherTypeRaw = ${prefix}:Person,
            foaf:Person,
            ""
          )
        )
      AS ?${publisherType})
      FILTER(?${publisherType} != "")
      OPTIONAL {
        ?${publisher} ${prefix}:contactPoint/${prefix}:email ?${publisherEmail} .  
      }
    }
        
    OPTIONAL {
      ?${dataset} ${prefix}:distribution ?${distribution} .
      ?${distribution} a ${prefix}:DataDownload .
      ?${distribution} ${prefix}:encodingFormat ${normalizeMediaType(distributionMediaType)} .
      ?${distribution} ${prefix}:contentUrl ${convertToIri(distributionUrl)} .

      BIND(
        IF(
          CONTAINS(STR(?${distributionMediaType}), "sparql"),
          <https://www.w3.org/TR/sparql11-protocol/>,
          ?unbound
        ) AS ?${distributionConformsToSparql} 
      )
        
      OPTIONAL { ?${distribution} ${prefix}:datePublished ${convertToXsdDate(
        distributionDatePublished,
      )} }
      OPTIONAL { ?${distribution} ${prefix}:dateModified ${convertToXsdDate(
        distributionDateModified,
      )} }
      OPTIONAL { ?${distribution} ${prefix}:description ?${distributionDescription} }
      OPTIONAL { ?${distribution} ${prefix}:inLanguage ?${distributionLanguage} }
      OPTIONAL { ?${distribution} ${prefix}:license ${normalizeLicense(distributionLicense)} }
      OPTIONAL { ?${distribution} ${prefix}:name ?${distributionName} }
      OPTIONAL { ?${distribution} ${prefix}:contentSize ${normalizeByteSize(distributionSize)} }
      OPTIONAL { 
        ?${distribution} ${prefix}:usageInfo ?${distributionConformsTo} .
        FILTER(isIRI(?${distributionConformsTo}))  
      }
    } 
     
    OPTIONAL { ?${dataset} ${prefix}:description ?${description} } 
    OPTIONAL { ?${dataset} ${prefix}:identifier ?${identifier} }
    OPTIONAL { ?${dataset} ${prefix}:alternateName ?${alternateName} }
    OPTIONAL { ?${dataset} ${prefix}:dateCreated ${convertToXsdDate(
      dateCreated,
    )} }
    OPTIONAL { ?${dataset} ${prefix}:datePublished ${convertToXsdDate(
      datePublished,
    )} }
    OPTIONAL { ?${dataset} ${prefix}:dateModified ${convertToXsdDate(
      dateModified,
    )} }
    OPTIONAL { ?${dataset} ${prefix}:inLanguage ?${language} }
    OPTIONAL { ?${dataset} ${prefix}:isBasedOn ?${source} }
    OPTIONAL { ?${dataset} ${prefix}:isBasedOnUrl ?${source} } 
    OPTIONAL { ?${dataset} ${prefix}:keywords ?${keyword} }
    OPTIONAL {
      ?${dataset} ${prefix}:spatialCoverage ?${spatialCoverage} .
      FILTER(!isBlank(?${spatialCoverage}))
    }
    OPTIONAL { ?${dataset} ${prefix}:temporalCoverage ?${temporalCoverage} }
    OPTIONAL { 
      ?${dataset} ${prefix}:genre ?${genre}
      FILTER(isLiteral(?${genre}))
    }
    OPTIONAL { ?${dataset} ${prefix}:version ?${version} }
    OPTIONAL { ?${dataset} ${prefix}:includedInDataCatalog ?${includedInDataCatalog} }
    OPTIONAL { ?${dataset} ${prefix}:hasPart ?${hasPart} }
    OPTIONAL { ?${dataset} ${prefix}:citation ?${isReferencedBy} }
    OPTIONAL { ?${dataset} ${prefix}:mainEntityOfPage ?${mainEntityOfPage} }
`;
}
