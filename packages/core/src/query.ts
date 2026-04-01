import factory from 'rdf-ext';
import {
  compressFormatFromMediaType,
  convertToIri,
  convertToXsdDate,
  convertUriToLiteral,
  defaultLanguageTag,
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
const accessRights = 'accessRights';

const creatorName = 'creator_name';
const creatorType = 'creator_type';

const publisherType = 'publisher_type';
const publisherName = 'publisher_name';
const publisherEmail = 'publisher_email';
const contactPoint = 'contactPoint';
const contactPointName = 'contactPoint_name';
const contactPointEmail = 'contactPoint_email';
const publisherIdentifier = 'publisher_identifier';
const publisherAlternateName = 'publisher_alternate_name';
const publisherSameAs = 'publisher_sameAs';

const distributionUrl = 'distribution_url';
const distributionMediaType = 'distribution_mediaType';
const distributionConformsTo = 'distribution_conformsTo';
const distributionConformsToProtocol = 'distribution_conformsTo_protocol';
const distributionConformsToSparql = 'distribution_conformsTo_sparql';
const distributionDatePublished = 'distribution_datePublished';
const distributionDateModified = 'distribution_dateModified';
const distributionDescription = 'distribution_description';
const distributionLanguage = 'distribution_language';
const distributionLicense = 'distribution_license';
const distributionSize = 'distribution_size';
const distributionCompressFormat = 'distribution_compressFormat';
const distributionDownloadUrl = 'distribution_downloadUrl';
const distributionMediaTypeForDownload = 'distribution_mediaType_download';
const distributionCompressFormatForDownload =
  'distribution_compressFormat_download';

/**
 * Known web API protocol specification URLs, used to distinguish API distributions
 * from download distributions. Only distributions whose conformsTo/usageInfo matches
 * one of these are classified as APIs; other conformsTo values (application profiles,
 * vocabularies, ontologies) are preserved on download distributions.
 *
 * @see https://docs.nde.nl/requirements-datasets/#developer-docs
 */
const apiProtocolUrls = [
  'http://www.openarchives.org/pmh/',
  'https://www.w3.org/TR/sparql11-protocol/',
  'https://linkeddatafragments.org/specification/triple-pattern-fragments/',
  'https://developers.arcgis.com/rest/',
  'https://www.ogc.org/standards/wms/',
  'https://spec.openapis.org/oas/v3.2.0.html',
  'https://spec.graphql.org/',
];

const apiProtocolValues = apiProtocolUrls.map((url) => `<${url}>`).join(' ');

/** Generates a prefixed SPARQL variable name, e.g. odrlVar('perm', 'action') → 'perm_action'. */
const odrlVar = (prefix: string, prop: string) => `${prefix}_${prop}`;

export const dcat = (property: string): NamedNode =>
  factory.namedNode(`http://www.w3.org/ns/dcat#${property}`);
export const dct = (property: string): NamedNode =>
  factory.namedNode(`http://purl.org/dc/terms/${property}`);
export const foaf = (property: string): NamedNode =>
  factory.namedNode(`http://xmlns.com/foaf/0.1/${property}`);
export const odrl = (property: string): NamedNode =>
  factory.namedNode(`http://www.w3.org/ns/odrl/2/${property}`);
export const rdf = (property: string): NamedNode =>
  factory.namedNode(`http://www.w3.org/1999/02/22-rdf-syntax-ns#${property}`);

export const datasetType = dcat('Dataset');
export const sparqlLimit = 1_000_000;

const languageAuthorityBase =
  'http://publications.europa.eu/resource/authority/language/';

/**
 * Generates SPARQL to normalize a language value (BCP 47 literal or EU authority URI)
 * to an EU Language Authority URI.
 */
function normalizeLanguage(rawVar: string, outputVar: string): string {
  return `
      BIND(IF(isIRI(${rawVar}), ${rawVar},
        IRI(CONCAT("${languageAuthorityBase}",
          COALESCE(
            IF(SUBSTR(LCASE(STR(${rawVar})), 1, 2) = "nl", "NLD",
            IF(SUBSTR(LCASE(STR(${rawVar})), 1, 2) = "en", "ENG",
            IF(SUBSTR(LCASE(STR(${rawVar})), 1, 2) = "de", "DEU",
            IF(SUBSTR(LCASE(STR(${rawVar})), 1, 2) = "fr", "FRA",
            IF(SUBSTR(LCASE(STR(${rawVar})), 1, 2) = "fy", "FRY",
            IF(SUBSTR(LCASE(STR(${rawVar})), 1, 2) = "la", "LAT",
            IF(SUBSTR(LCASE(STR(${rawVar})), 1, 2) = "es", "SPA",
            IF(SUBSTR(LCASE(STR(${rawVar})), 1, 2) = "it", "ITA",
            IF(SUBSTR(LCASE(STR(${rawVar})), 1, 2) = "pt", "POR",
            1/0))))))))),
            UCASE(SUBSTR(STR(${rawVar}), 1, 3))
          )
        ))
      ) AS ?${outputVar})`;
}

export const constructQuery = `
  PREFIX dcat: <http://www.w3.org/ns/dcat#>
  PREFIX dct: <http://purl.org/dc/terms/>
  PREFIX foaf: <http://xmlns.com/foaf/0.1/>
  PREFIX odrl: <http://www.w3.org/ns/odrl/2/>
  PREFIX owl: <http://www.w3.org/2002/07/owl#>
  PREFIX schema: <https://schema.org/>
  PREFIX vcard: <http://www.w3.org/2006/vcard/ns#>
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
      dcat:version ?${version} ;
      dct:isPartOf ?${includedInDataCatalog} ;
      dct:hasPart ?${hasPart} ;
      dct:isReferencedBy ?${isReferencedBy} ;
      dct:accessRights ?${accessRights} ;
      dcat:theme ?theme ;
      dcat:theme ?themeDefault ;
      dct:publisher ?${publisher} ;
      dct:creator ?${creator} ;
      dcat:contactPoint ?${contactPoint} ;
      dcat:distribution ?${distribution} .

    ?${contactPoint} a vcard:Kind ;
      vcard:fn ?${contactPointName} ;
      vcard:hasEmail ?${contactPointEmail} .
      
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
      dcat:downloadURL ?${distributionDownloadUrl} ;
      dcat:mediaType ?${distributionMediaTypeForDownload} ;
      dcat:compressFormat ?${distributionCompressFormatForDownload} ;
      dct:conformsTo ?${distributionConformsTo} ;
      dct:conformsTo ?${distributionConformsToSparql} ;
      dct:issued ?${distributionDatePublished} ;
      dct:modified ?${distributionDateModified} ;
      dct:description ?${distributionDescription} ;
      dct:language ?${distributionLanguage} ;
      dct:license ?${distributionLicense} ;
      dcat:byteSize ?${distributionSize} ;
      odrl:hasPolicy ?policy .

    ?policy a ?policy_type ;
      odrl:profile ?policy_profile ;
      odrl:permission ?permission ;
      odrl:prohibition ?prohibition ;
      odrl:obligation ?obligation .

    ${odrlRuleConstruct('permission', 'perm', ['odrl:duty ?duty'])}
    ${odrlRuleConstruct('duty', 'duty')}
    ${odrlRuleConstruct('prohibition', 'prohib')}
    ${odrlRuleConstruct('obligation', 'oblig')}
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
          foaf:name ${defaultLanguageTag(publisherName)} .

        OPTIONAL { ?${publisher} foaf:nick ?${publisherAlternateName} ; }
        OPTIONAL { ?${publisher} dct:identifier ?${publisherIdentifier} ; }
        OPTIONAL { ?${publisher} foaf:mbox ?${publisherEmail} ; }
        OPTIONAL { ?${publisher} owl:sameAs ?${publisherSameAs} ; }
        OPTIONAL {
          ?${dataset} dcat:contactPoint ?${contactPoint} .
          OPTIONAL { ?${contactPoint} vcard:fn ?${contactPointName} . }
          OPTIONAL { ?${contactPoint} vcard:hasEmail ?${contactPointEmail} . }
        }

        OPTIONAL {
          ?${creator} a ?foafOrganizationOrPerson ;
            a ?${creatorType} ;
            foaf:name ${defaultLanguageTag(creatorName)} .
        }
          
        VALUES ?foafOrganizationOrPerson { foaf:Organization foaf:Person }
  
        OPTIONAL {
          ?${dataset} dcat:distribution ?${distribution} .
          ?${distribution} a dcat:Distribution .
          ?${distribution} dcat:mediaType ${normalizeMediaType(distributionMediaType)} .
          ?${distribution} dcat:accessURL ${convertToIri(distributionUrl)} .
          OPTIONAL { ?${distribution} dct:conformsTo ?${distributionConformsTo} . }
          OPTIONAL {
            ?${distribution} dct:conformsTo ?${distributionConformsToProtocol} .
            VALUES ?${distributionConformsToProtocol} { ${apiProtocolValues} }
          }
          BIND(
            IF(
              CONTAINS(STR(?${distributionMediaType}), "sparql"),
              <https://www.w3.org/TR/sparql11-protocol/>,
              ?unbound
            ) AS ?${distributionConformsToSparql}
          )
          ${compressFormatFromMediaType(distributionMediaType, distributionCompressFormat)}
          OPTIONAL { ?${distribution} dct:issued ${convertToXsdDate(
            distributionDatePublished,
          )} }
          OPTIONAL { ?${distribution} dct:modified ${convertToXsdDate(
            distributionDateModified,
          )} }
          OPTIONAL { ?${distribution} dct:description ?${distributionDescription} }
          OPTIONAL {
            ?${distribution} dct:language ?${distributionLanguage}Raw .
            ${normalizeLanguage(`?${distributionLanguage}Raw`, distributionLanguage)}
          }
          OPTIONAL { ?${distribution} dct:license ${normalizeLicense(distributionLicense)} }
          OPTIONAL { ?${distribution} dcat:byteSize ?${distributionSize} }
          OPTIONAL {
            ?${distribution} odrl:hasPolicy ?policy .
            OPTIONAL { ?policy a ?policy_type }
            OPTIONAL { ?policy odrl:profile ?policy_profile }
            ${odrlRuleWhere('policy', 'permission', 'permission', 'perm', odrlRuleWhere('permission', 'duty', 'duty', 'duty'))}
            ${odrlRuleWhere('policy', 'prohibition', 'prohibition', 'prohib')}
            ${odrlRuleWhere('policy', 'obligation', 'obligation', 'oblig')}
          }
        }
        ${downloadOnlyProperties(distributionConformsToProtocol, distributionConformsToSparql, distributionUrl, distributionMediaType, distributionCompressFormat, distributionDownloadUrl, distributionMediaTypeForDownload, distributionCompressFormatForDownload)}

        OPTIONAL { ?${dataset} dct:description ?${description} }
        BIND(STR(?${dataset}) AS ?${identifier})
        OPTIONAL { ?${dataset} dct:alternative ?${alternateName} }
        OPTIONAL { ?${dataset} dct:created ${convertToXsdDate(dateCreated)} }
        OPTIONAL { ?${dataset} dct:issued ${convertToXsdDate(datePublished)} }
        OPTIONAL { ?${dataset} dct:modified ${convertToXsdDate(dateModified)} }
        OPTIONAL {
          ?${dataset} dct:language ?${language}Raw .
          ${normalizeLanguage(`?${language}Raw`, language)}
        }
        OPTIONAL { ?${dataset} dct:source ?${source} }
        OPTIONAL { ?${dataset} dcat:keyword ${convertUriToLiteral(keyword)} }
        OPTIONAL {
          ?${dataset} dct:spatial ?${spatialCoverage} .
          FILTER(!isBlank(?${spatialCoverage}))
        }
        OPTIONAL { ?${dataset} dct:temporal ?${temporalCoverage} }
        OPTIONAL { 
          ?${dataset} dct:genre ?${genre}
          FILTER(isLiteral(?${genre}))
        }
        OPTIONAL { ?${dataset} dcat:version ?${version} }
        OPTIONAL { ?${dataset} dct:isPartOf ?${includedInDataCatalog} }
        OPTIONAL { ?${dataset} dct:hasPart ?${hasPart} }
        OPTIONAL { ?${dataset} dct:isReferencedBy ?${isReferencedBy} }
        OPTIONAL { ?${dataset} dcat:landingPage ?${mainEntityOfPage} }
        OPTIONAL { ?${dataset} dct:accessRights ?${accessRights}Provided }
        BIND(COALESCE(?${accessRights}Provided, <http://publications.europa.eu/resource/authority/access-right/PUBLIC>) AS ?${accessRights})
        OPTIONAL { ?${dataset} dcat:theme ?theme }
        BIND(<http://publications.europa.eu/resource/authority/data-theme/EDUC> AS ?themeDefault)
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
        ${prefix}:name ${defaultLanguageTag(creatorName)} .
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
        ${prefix}:name ${defaultLanguageTag(publisherName)} .
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
        ?${publisher} ${prefix}:contactPoint ?${contactPoint} .
        ?${contactPoint} ${prefix}:email ?contactPointEmailRaw .
        BIND(IRI(CONCAT("mailto:", STR(?contactPointEmailRaw))) AS ?${contactPointEmail})
        OPTIONAL { ?${contactPoint} ${prefix}:name ?${contactPointName} . }
      }
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
      ${compressFormatFromMediaType(distributionMediaType, distributionCompressFormat)}

      OPTIONAL { ?${distribution} ${prefix}:datePublished ${convertToXsdDate(
        distributionDatePublished,
      )} }
      OPTIONAL { ?${distribution} ${prefix}:dateModified ${convertToXsdDate(
        distributionDateModified,
      )} }
      OPTIONAL { ?${distribution} ${prefix}:description ?${distributionDescription} }
      OPTIONAL {
        ?${distribution} ${prefix}:inLanguage ?${distributionLanguage}Raw .
        ${normalizeLanguage(`?${distributionLanguage}Raw`, distributionLanguage)}
      }
      OPTIONAL { ?${distribution} ${prefix}:license ${normalizeLicense(distributionLicense + 'Provided')} }
      BIND(COALESCE(?${distributionLicense}Provided, ?${license}) AS ?${distributionLicense})
      OPTIONAL { ?${distribution} ${prefix}:contentSize ?${distributionSize} }
      OPTIONAL {
        ?${distribution} ${prefix}:usageInfo ?${distributionConformsTo} .
        FILTER(isIRI(?${distributionConformsTo}))
      }
      OPTIONAL {
        ?${distribution} ${prefix}:usageInfo ?${distributionConformsToProtocol} .
        VALUES ?${distributionConformsToProtocol} { ${apiProtocolValues} }
      }
    }
    ${downloadOnlyProperties(distributionConformsToProtocol, distributionConformsToSparql, distributionUrl, distributionMediaType, distributionCompressFormat, distributionDownloadUrl, distributionMediaTypeForDownload, distributionCompressFormatForDownload)}

    OPTIONAL { ?${dataset} ${prefix}:description ?${description} }
    BIND(STR(?${dataset}) AS ?${identifier})
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
    OPTIONAL {
      ?${dataset} ${prefix}:inLanguage ?${language}Raw .
      ${normalizeLanguage(`?${language}Raw`, language)}
    }
    OPTIONAL { ?${dataset} ${prefix}:isBasedOn ?${source} }
    OPTIONAL { ?${dataset} ${prefix}:isBasedOnUrl ?${source} } 
    OPTIONAL { ?${dataset} ${prefix}:keywords ${convertUriToLiteral(keyword)} }
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
    OPTIONAL { ?${dataset} dct:accessRights ?${accessRights}Provided }
    BIND(COALESCE(?${accessRights}Provided, <http://publications.europa.eu/resource/authority/access-right/PUBLIC>) AS ?${accessRights})
    BIND(<http://publications.europa.eu/resource/authority/data-theme/EDUC> AS ?themeDefault)
`;
}

/**
 * For download distributions (no known protocol in conformsTo), emit downloadURL,
 * mediaType, and compressFormat. For API distributions (conformsTo matches a known
 * protocol URL), suppress all three — they are meaningless for APIs.
 */
function downloadOnlyProperties(
  conformsToProtocolVariable: string,
  conformsToSparqlVariable: string,
  urlVariable: string,
  mediaTypeVariable: string,
  compressFormatVariable: string,
  downloadUrlOutput: string,
  mediaTypeOutput: string,
  compressFormatOutput: string,
): string {
  const isApi = `BOUND(?${conformsToProtocolVariable}) || BOUND(?${conformsToSparqlVariable})`;
  return `BIND(IF(${isApi}, ?unbound, ?${urlVariable}) AS ?${downloadUrlOutput})
  BIND(IF(${isApi}, ?unbound, ?${mediaTypeVariable}) AS ?${mediaTypeOutput})
  BIND(IF(${isApi}, ?unbound, ?${compressFormatVariable}) AS ?${compressFormatOutput})`;
}

/** Generates CONSTRUCT triple patterns for an ODRL rule and its constraint. */
function odrlRuleConstruct(
  ruleVar: string,
  prefix: string,
  extraProperties: string[] = [],
): string {
  const c = odrlVar(prefix, 'constraint');
  const extras = extraProperties.map((p) => `;\n      ${p}`).join('');
  return `?${ruleVar} a ?${odrlVar(prefix, 'type')} ;
      odrl:target ?${odrlVar(prefix, 'target')} ;
      odrl:action ?${odrlVar(prefix, 'action')} ;
      odrl:assignee ?${odrlVar(prefix, 'assignee')} ;
      odrl:assigner ?${odrlVar(prefix, 'assigner')} ;
      odrl:constraint ?${c}${extras} .

    ?${c} a ?${odrlVar(prefix, 'constraint_type')} ;
      odrl:leftOperand ?${odrlVar(prefix, 'constraint_leftOperand')} ;
      odrl:operator ?${odrlVar(prefix, 'constraint_operator')} ;
      odrl:rightOperand ?${odrlVar(prefix, 'constraint_rightOperand')} .`;
}

/** Generates nested OPTIONAL WHERE patterns for an ODRL rule and its constraint. */
function odrlRuleWhere(
  parentVar: string,
  predicate: string,
  ruleVar: string,
  prefix: string,
  extraPatterns = '',
): string {
  const c = odrlVar(prefix, 'constraint');
  // action is required per ODRL spec; type, target, assignee, assigner are optional.
  // leftOperand, operator, rightOperand are all required when a constraint exists.
  return `OPTIONAL {
              ?${parentVar} odrl:${predicate} ?${ruleVar} .
              ?${ruleVar} odrl:action ?${odrlVar(prefix, 'action')} .
              OPTIONAL { ?${ruleVar} a ?${odrlVar(prefix, 'type')} }
              OPTIONAL { ?${ruleVar} odrl:target ?${odrlVar(prefix, 'target')} }
              OPTIONAL { ?${ruleVar} odrl:assignee ?${odrlVar(prefix, 'assignee')} }
              OPTIONAL { ?${ruleVar} odrl:assigner ?${odrlVar(prefix, 'assigner')} }
              OPTIONAL {
                ?${ruleVar} odrl:constraint ?${c} .
                ?${c} odrl:leftOperand ?${odrlVar(prefix, 'constraint_leftOperand')} .
                ?${c} odrl:operator ?${odrlVar(prefix, 'constraint_operator')} .
                ?${c} odrl:rightOperand ?${odrlVar(prefix, 'constraint_rightOperand')} .
                OPTIONAL { ?${c} a ?${odrlVar(prefix, 'constraint_type')} }
              }
              ${extraPatterns}
            }`;
}
