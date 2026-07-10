<script lang="ts">
  import { REGISTRATION_STATUS_BASE_URI } from '@dataset-register/core/constants';
  import * as m from '$lib/paraglide/messages';

  // The dataset listing is served by a full-text search index, whose ranking and
  // fuzzy matching cannot be reproduced faithfully in SPARQL. Rather than fake it,
  // the button links to a self-contained example that fetches comparable data –
  // the fields a card shows – straight from the public SPARQL endpoint, so users
  // can see the underlying Linked Data and adapt the query to their own needs.
  const exampleQuery = `PREFIX dcat: <http://www.w3.org/ns/dcat#>
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

  // The /datasetregister backend holds the register’s named graphs; the default
  // backend does not, so link to it explicitly.
  const sparqlUrl = `https://qlever.netwerkdigitaalerfgoed.nl/datasetregister?query=${encodeURIComponent(
    exampleQuery,
  )}&exec=true`;
</script>

<a
  href={sparqlUrl}
  target="_blank"
  rel="noopener noreferrer"
  class="group relative inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 border border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
>
  <div
    class="invisible absolute bottom-full left-1/2 mb-2 -translate-x-1/2 transform rounded bg-gray-800 px-2 py-1 text-xs whitespace-nowrap text-white opacity-0 transition-opacity duration-200 group-hover:visible group-hover:opacity-100"
  >
    {m.sparql_view_query()}
    <div
      class="absolute top-full left-1/2 h-0 w-0 -translate-x-1/2 border-t-4 border-r-4 border-l-4 border-t-gray-800 border-r-transparent border-l-transparent"
    ></div>
  </div>
  SPARQL
  <svg
    class="w-3 h-3"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
    />
  </svg>
</a>
