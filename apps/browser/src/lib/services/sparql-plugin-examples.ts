/** Live-register examples: view directives select the matching LDForge plugin. */
export const sparqlPluginExamples = [
  {
    id: 'plugin-table',
    label: { en: 'Table · Dataset publishers', nl: 'Tabel · Datasetuitgevers' },
    query: `# view=table
# Counts distinct currently valid datasets, not search-index documents.
PREFIX dcat: <http://www.w3.org/ns/dcat#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX schema: <https://schema.org/>

SELECT ?publisher (SAMPLE(?name) AS ?publisherName)
       (COUNT(DISTINCT ?dataset) AS ?datasets)
WHERE {
  ?dataset a dcat:Dataset ; dct:publisher ?publisher ; schema:subjectOf ?registration .
  ?registration schema:additionalType <https://data.netwerkdigitaalerfgoed.nl/registry/valid> .
  ?publisher foaf:name ?name .
}
GROUP BY ?publisher
ORDER BY DESC(?datasets) ?publisher
LIMIT 25`,
  },
  {
    id: 'plugin-cards',
    label: {
      en: 'Cards · Discover heritage datasets',
      nl: 'Kaarten · Ontdek erfgoeddatasets',
    },
    query: `# view=cards
# One representative dataset per publisher, selected from the live register.
PREFIX dcat: <http://www.w3.org/ns/dcat#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX schema: <https://schema.org/>

SELECT (SAMPLE(?title) AS ?card_title)
       (CONCAT(SAMPLE(?name), " — ", SUBSTR(SAMPLE(?description), 1, 280)) AS ?card_text)
       ("Bekijk dataset" AS ?card_button)
       (IRI(CONCAT("https://datasetregister.netwerkdigitaalerfgoed.nl/dataset?uri=", ENCODE_FOR_URI(STR(?dataset)))) AS ?card_button_url)
WHERE {
  {
    SELECT ?publisher (MIN(STR(?d)) AS ?datasetIRI) (COUNT(DISTINCT ?d) AS ?total)
    WHERE {
      ?d a dcat:Dataset ; dct:publisher ?publisher ; schema:subjectOf ?r .
      ?r schema:additionalType <https://data.netwerkdigitaalerfgoed.nl/registry/valid> .
    }
    GROUP BY ?publisher
    ORDER BY DESC(?total) ?publisher
    LIMIT 18
  }
  BIND(IRI(?datasetIRI) AS ?dataset)
  ?dataset a dcat:Dataset ; dct:title ?title ; dct:description ?description ;
    dct:publisher ?publisher ; schema:subjectOf ?registration .
  ?registration schema:additionalType <https://data.netwerkdigitaalerfgoed.nl/registry/valid> .
  ?publisher foaf:name ?name .
}
GROUP BY ?dataset
ORDER BY ?card_title ?dataset
LIMIT 18`,
  },
  {
    id: 'plugin-chart-publishers',
    label: {
      en: 'Bar chart · Top 10 publishers',
      nl: 'Staafdiagram · Top 10 uitgevers',
    },
    query: `# view=charts; chart=bar; chart-title=Top 10 uitgevers — geldige datasets
PREFIX dcat: <http://www.w3.org/ns/dcat#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX schema: <https://schema.org/>

SELECT (SAMPLE(?name) AS ?chart_label)
       (COUNT(DISTINCT ?dataset) AS ?chart_value)
WHERE {
  ?dataset a dcat:Dataset ; dct:publisher ?publisher ; schema:subjectOf ?registration .
  ?registration schema:additionalType <https://data.netwerkdigitaalerfgoed.nl/registry/valid> .
  ?publisher foaf:name ?name .
}
GROUP BY ?publisher
ORDER BY DESC(?chart_value) ?publisher
LIMIT 10`,
  },
  {
    id: 'plugin-chart-registrations',
    label: {
      en: 'Line chart · Registrations by month',
      nl: 'Lijndiagram · Registraties per maand',
    },
    query: `# view=charts; chart=line; chart-title=Registratie-URLs per maand
# This is datePosted of URLs still in the register, not a historical event log.
# Only months with registrations are returned; no artificial observations are added.
PREFIX schema: <https://schema.org/>

SELECT ?chart_label (COUNT(DISTINCT ?registration) AS ?chart_value)
FROM <https://demo.netwerkdigitaalerfgoed.nl/registry/registrations>
WHERE {
  ?registration a schema:EntryPoint ; schema:datePosted ?posted .
  BIND(SUBSTR(STR(?posted), 1, 7) AS ?chart_label)
}
GROUP BY ?chart_label
ORDER BY ?chart_label`,
  },
  {
    id: 'plugin-chart-ratings',
    label: {
      en: 'Doughnut · Dataset metadata ratings',
      nl: 'Ringdiagram · Metadatabeoordelingen',
    },
    query: `# view=charts; chart=doughnut; chart-title=Metadatabeoordeling van geldige datasets
# The register's rating describes metadata, not the quality of collection objects.
# Each dataset occurs once; only ratings on the 0–100 scale are included.
PREFIX dcat: <http://www.w3.org/ns/dcat#>
PREFIX schema: <https://schema.org/>

SELECT ?chart_label (COUNT(*) AS ?chart_value)
WHERE {
  {
    SELECT ?dataset (MAX(?rating) AS ?score)
    WHERE {
      ?dataset a dcat:Dataset ; schema:subjectOf ?registration ;
        schema:contentRating/schema:ratingValue ?rating .
      ?registration schema:additionalType <https://data.netwerkdigitaalerfgoed.nl/registry/valid> .
      FILTER(?rating >= 0 && ?rating <= 100)
    }
    GROUP BY ?dataset
  }
  BIND(IF(?score < 60, "0–59", IF(?score < 80, "60–79", IF(?score < 95, "80–94", "95–100"))) AS ?chart_label)
}
GROUP BY ?chart_label
ORDER BY ?chart_label`,
  },
  {
    id: 'plugin-geo',
    label: {
      en: 'Map · Publishers in the Netherlands',
      nl: 'Landkaart · Uitgevers in Nederland',
    },
    query: `# view=geo; geo-title=Uitgevers in Nederland — live gekoppeld met Wikidata
# Publisher locations come from the register; coordinates and Dutch place names
# come from Wikidata via SERVICE. Match GeoNames IDs, avoiding ambiguous names.
# Return one row per publisher; the host groups popups and markers by place.
# The coordinate is a place centre, NOT an address.
# Publishers without a matching Dutch location are not shown.
PREFIX dcat: <http://www.w3.org/ns/dcat#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX schema: <https://schema.org/>
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT ?place ?geometry ?publisher ?publisherName ?datasets
       (?placeName AS ?geometryLabel) (?place AS ?geoLink)
WHERE {
  {
    SELECT ?publisher ?geonamesId (MIN(STR(?name)) AS ?publisherName)
           (COUNT(DISTINCT ?dataset) AS ?datasets)
    WHERE {
      ?dataset a dcat:Dataset ; dct:publisher ?publisher ; schema:subjectOf ?registration .
      ?registration schema:additionalType <https://data.netwerkdigitaalerfgoed.nl/registry/valid> .
      ?publisher foaf:name ?name ; schema:location ?location .
      FILTER(REGEX(STR(?location), "geonames.org/[0-9]+/?$"))
      BIND(REPLACE(STR(?location), "^.*geonames.org/([0-9]+)/?$", "$1") AS ?geonamesId)
    }
    GROUP BY ?publisher ?geonamesId
  }
  SERVICE <https://query.wikidata.org/sparql> {
    ?place wdt:P1566 ?geonamesId ;
      wdt:P17 wd:Q55 ;
      wdt:P625 ?geometry ;
      rdfs:label ?placeName .
    FILTER(LANG(?placeName) = "nl")
  }
}
ORDER BY ?placeName ?place ?publisherName ?publisher`,
  },
  {
    id: 'plugin-network',
    label: {
      en: 'Network · Publishers and datasets',
      nl: 'Netwerk · Uitgevers en datasets',
    },
    query: `# view=network; network-title=Uitgevers en hun datasets
# Edges represent dct:publisher, not collaboration between organizations.
# Select three publishers with 10–30 valid datasets to keep the network readable.
PREFIX dcat: <http://www.w3.org/ns/dcat#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX schema: <https://schema.org/>

SELECT ?source (SAMPLE(?name) AS ?sourceLabel) ?target
       (SAMPLE(?title) AS ?targetLabel)
       ("publiceert" AS ?relationLabel)
       ("Uitgever" AS ?sourceGroup) ("Dataset" AS ?targetGroup)
WHERE {
  {
    SELECT ?source (COUNT(DISTINCT ?candidate) AS ?total)
    WHERE {
      ?candidate a dcat:Dataset ; dct:publisher ?source ; schema:subjectOf ?r .
      ?r schema:additionalType <https://data.netwerkdigitaalerfgoed.nl/registry/valid> .
    }
    GROUP BY ?source
    HAVING(COUNT(DISTINCT ?candidate) >= 10 && COUNT(DISTINCT ?candidate) <= 30)
    ORDER BY DESC(?total) ?source
    LIMIT 3
  }
  ?target a dcat:Dataset ; dct:publisher ?source ; dct:title ?title ; schema:subjectOf ?registration .
  ?registration schema:additionalType <https://data.netwerkdigitaalerfgoed.nl/registry/valid> .
  ?source foaf:name ?name .
}
GROUP BY ?source ?target
ORDER BY ?source ?target
LIMIT 80`,
  },
  {
    id: 'plugin-timeline',
    label: {
      en: 'Timeline · Recent registrations',
      nl: 'Tijdlijn · Recente registraties',
    },
    query: `# view=timeline; timeline-title=De 30 nieuwste registratie-URLs
# datePosted is the registration date, not the creation date of the collection.
# One point per registration URL; a URL can describe several datasets.
PREFIX dcat: <http://www.w3.org/ns/dcat#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX schema: <https://schema.org/>

SELECT (SAMPLE(?title) AS ?timelineLabel) (MAX(?posted) AS ?timelineStart)
       (SAMPLE(?name) AS ?timelineGroup) (?registration AS ?timelineLink)
       ("Registratiedatum van deze URL; geen datum van de collectieobjecten." AS ?timelineDescription)
WHERE {
  ?dataset a dcat:Dataset ; dct:title ?title ; dct:publisher/foaf:name ?name ;
    schema:subjectOf ?registration .
  ?registration schema:datePosted ?posted ;
    schema:additionalType <https://data.netwerkdigitaalerfgoed.nl/registry/valid> .
}
GROUP BY ?registration
ORDER BY DESC(?timelineStart) ?registration
LIMIT 30`,
  },
  {
    id: 'plugin-pivot',
    label: {
      en: 'Pivot · Formats by publisher',
      nl: 'Draaitabel · Formaten per uitgever',
    },
    query: `# view=pivot; pivot-title=Datasets per uitgever en mediaformaat; pivot-aggregate=sum; pivot-row-title=Uitgever; pivot-column-title=Mediaformaat
# A dataset can have multiple formats and therefore appear in multiple columns.
PREFIX dcat: <http://www.w3.org/ns/dcat#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX schema: <https://schema.org/>

SELECT (MIN(STR(?name)) AS ?pivotRow) ?pivotColumn
       (COUNT(DISTINCT ?dataset) AS ?pivotValue)
WHERE {
  {
    SELECT ?publisher (COUNT(DISTINCT ?d) AS ?total)
    WHERE {
      ?d a dcat:Dataset ; dct:publisher ?publisher ; schema:subjectOf ?r .
      ?r schema:additionalType <https://data.netwerkdigitaalerfgoed.nl/registry/valid> .
    }
    GROUP BY ?publisher
    ORDER BY DESC(?total) ?publisher
    LIMIT 10
  }
  ?dataset a dcat:Dataset ; dct:publisher ?publisher ; schema:subjectOf ?registration ;
    dcat:distribution/dcat:mediaType ?mediaType .
  ?registration schema:additionalType <https://data.netwerkdigitaalerfgoed.nl/registry/valid> .
  ?publisher foaf:name ?name .
  BIND(REPLACE(STR(?mediaType), "^https?://www.iana.org/assignments/media-types/", "") AS ?pivotColumn)
}
GROUP BY ?publisher ?pivotColumn
ORDER BY ?pivotRow ?pivotColumn`,
  },
  {
    id: 'plugin-tree',
    label: {
      en: 'Tree · Browse datasets by publisher',
      nl: 'Boom · Datasets per uitgever',
    },
    query: `# view=tree; tree-title=Blader door de datasets van drie uitgevers
# Publisher roots and dataset children follow the real dct:publisher links.
# Select three publishers with 10–30 valid datasets from the current data.
PREFIX dcat: <http://www.w3.org/ns/dcat#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX schema: <https://schema.org/>

SELECT ?tree_id ?tree_parent (SAMPLE(?label) AS ?tree_label) (?tree_id AS ?tree_url)
WHERE {
  {
    SELECT ?publisher (COUNT(DISTINCT ?candidate) AS ?total)
    WHERE {
      ?candidate a dcat:Dataset ; dct:publisher ?publisher ; schema:subjectOf ?r .
      ?r schema:additionalType <https://data.netwerkdigitaalerfgoed.nl/registry/valid> .
    }
    GROUP BY ?publisher
    HAVING(COUNT(DISTINCT ?candidate) >= 10 && COUNT(DISTINCT ?candidate) <= 30)
    ORDER BY DESC(?total) ?publisher
    LIMIT 3
  }
  {
    ?publisher foaf:name ?label .
    BIND(?publisher AS ?tree_id)
  }
  UNION
  {
    ?tree_id a dcat:Dataset ; dct:publisher ?publisher ; dct:title ?label ;
      schema:subjectOf ?registration .
    ?registration schema:additionalType <https://data.netwerkdigitaalerfgoed.nl/registry/valid> .
    BIND(?publisher AS ?tree_parent)
  }
}
GROUP BY ?tree_id ?tree_parent
ORDER BY ?tree_parent ?tree_label ?tree_id
LIMIT 100`,
  },
  {
    id: 'plugin-boolean',
    label: {
      en: 'Boolean · Are there invalid registrations?',
      nl: 'Ja/nee · Zijn er ongeldige registraties?',
    },
    query: `# view=boolean
PREFIX schema: <https://schema.org/>

ASK
FROM <https://demo.netwerkdigitaalerfgoed.nl/registry/registrations>
WHERE {
  ?registration a schema:EntryPoint ;
    schema:additionalType <https://data.netwerkdigitaalerfgoed.nl/registry/invalid> .
}`,
  },
  {
    id: 'plugin-json',
    label: {
      en: 'JSON · Recent registration metadata',
      nl: 'JSON · Recente registratiemetadata',
    },
    query: `# view=json
# Inspect RDF term types, datatypes and values in SPARQL Results JSON.
PREFIX schema: <https://schema.org/>

SELECT ?registration ?posted ?read ?status
FROM <https://demo.netwerkdigitaalerfgoed.nl/registry/registrations>
WHERE {
  ?registration a schema:EntryPoint ; schema:datePosted ?posted .
  OPTIONAL { ?registration schema:dateRead ?read }
  OPTIONAL { ?registration schema:status ?status }
}
ORDER BY DESC(?posted) ?registration
LIMIT 10`,
  },
] as const;
