import { REGISTRATION_STATUS_BASE_URI } from '@dataset-register/core/constants';

// A standalone example of the data shown on dataset cards.
export const exampleQuery = `PREFIX dcat: <http://www.w3.org/ns/dcat#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX schema: <https://schema.org/>

# Example: list registered datasets with the fields shown on a card in the
# Dataset Register. The search page itself is powered by a full-text index; this
# query fetches comparable data directly from the SPARQL endpoint.
CONSTRUCT {
  ?dataset a dcat:Dataset ;
    dct:title ?title ;
    dct:description ?description ;
    dct:language ?language ;
    dct:license ?license ;
    dct:publisher ?publisher .
  ?publisher a foaf:Agent ;
    foaf:name ?publisherName .
}
WHERE {
  ?dataset a dcat:Dataset ;
    schema:subjectOf ?registrationUrl ;
    dct:title ?title ;
    dct:publisher ?publisher .
  ?publisher foaf:name ?publisherName .

  # Only datasets whose latest registration is valid.
  ?registrationUrl schema:additionalType <${REGISTRATION_STATUS_BASE_URI}valid> .

  OPTIONAL { ?dataset dct:description ?description }
  OPTIONAL { ?dataset dct:language ?language }
  OPTIONAL { ?dataset dct:license ?license }
}
LIMIT 24`;
