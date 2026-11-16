// Keep these queries self-contained so they also work when copied or shared.
export const sparqlExamples = [
  {
    id: 'recent-registrations',
    label: {
      en: 'Most recent registrations',
      nl: 'Meest recente registraties',
    },
    query: `PREFIX schema: <https://schema.org/>

SELECT *
FROM <https://demo.netwerkdigitaalerfgoed.nl/registry/registrations>
WHERE {
  ?url a schema:EntryPoint ;
    schema:datePosted ?posted .
  OPTIONAL {
    ?url schema:dateRead ?read ;
      schema:status ?status
  }
}
ORDER BY DESC(?posted)`,
  },
  {
    id: 'publisher-rating',
    label: {
      en: 'Average rating per publisher',
      nl: 'Gemiddelde beoordeling per uitgever',
    },
    query: `PREFIX schema: <https://schema.org/>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>

SELECT ?publisher ?name (AVG(?rating) AS ?avgrating)
WHERE {
  ?dataset schema:contentRating/schema:ratingValue ?rating ;
    dct:publisher ?publisher .
  ?publisher foaf:name ?name .
}
GROUP BY ?publisher ?name
ORDER BY DESC(?avgrating)`,
  },
  {
    id: 'allowed-domains',
    label: { en: 'Allowed domains', nl: 'Toegestane domeinen' },
    query: `PREFIX dcat: <http://www.w3.org/ns/dcat#>
PREFIX dct: <http://purl.org/dc/terms/>

SELECT ?domain
FROM <https://data.netwerkdigitaalerfgoed.nl/registry/allowed_domain_names>
WHERE {
  [] <https://data.netwerkdigitaalerfgoed.nl/allowed_domain_names/def/domain_name> ?domain
}
ORDER BY ?domain`,
  },
  {
    id: 'crawler',
    label: { en: 'Crawler', nl: 'Crawler' },
    query: `PREFIX schema: <https://schema.org/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

SELECT ?dataset (MAX(xsd:dateTime(?read)) AS ?lastRead) ?registration ?registration_lastRead ?registration_status ?registration_validUntil
FROM <https://demo.netwerkdigitaalerfgoed.nl/registry/registrations>
WHERE {
  ?dataset a schema:Dataset ;
    schema:dateRead ?read ;
    schema:subjectOf ?registration .

  ?registration schema:dateRead ?registration_lastRead ;
    schema:status ?registration_status .
  OPTIONAL { ?registration schema:validUntil ?registration_validUntil }

  # Find a specific registration URL.
  # FILTER (CONTAINS(STR(?registration), "https://archief.nl/id/"))
}
GROUP BY ?dataset ?registration ?registration_lastRead ?registration_status ?registration_validUntil
ORDER BY DESC(?lastRead)`,
  },
  {
    id: 'invalid-registrations',
    label: {
      en: 'Invalid registration URLs',
      nl: 'Ongeldige registratie-URLs',
    },
    query: `PREFIX schema: <https://schema.org/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

SELECT ?url ?posted (MAX(xsd:dateTime(?read)) AS ?lastRead) ?status ?dataset ?validUntil
WHERE {
  ?url a schema:EntryPoint ;
    schema:datePosted ?posted ;
    schema:dateRead ?read ;
    schema:status ?status
  OPTIONAL { ?url schema:about ?dataset } .
  OPTIONAL { ?url schema:validUntil ?validUntil } .

  # If the registration URL could not be read, its HTTP status code ≠ 200.
  # If the registration URL could be read but no longer validates, ?validUntil is set.
  FILTER (?status != 200 || (EXISTS { ?url schema:validUntil ?validUntil }))
}
GROUP BY ?url ?posted ?status ?dataset ?validUntil
ORDER BY ?lastRead`,
  },
] as const;
