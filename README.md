# Dataset Register

This is the [NDE](https://www.netwerkdigitaalerfgoed.nl/en/about-us/) Dataset Register,
a service that helps users find and discover datasets.

Institutions (such as cultural heritage organizations) register their dataset descriptions with the NDE Dataset Register
using its HTTP API. The Dataset Register builds an index by fetching, [validating](#validate-dataset-descriptions) and
periodically [crawling](#crawler) dataset descriptions.

The HTTP API is documented at https://datasetregister.netwerkdigitaalerfgoed.nl/api.

See the [Dataset Register Demonstrator](https://datasetregister.netwerkdigitaalerfgoed.nl),
a client application for this repository’s HTTP API, for more background information (in Dutch).

## Design principles

1. The application follows modern standards and best practices.
2. The application uses [Linked Data Platform (LDP)](https://www.w3.org/TR/ldp/) for HTTP operations.
3. The application prefers [JSON-LD](http://json-ld.org) as the data exchange format.
4. The application uses established Linked Data vocabularies,
   including [Schema.org](https://schema.org) and [DCAT](https://www.w3.org/TR/vocab-dcat-3/).
   The Schema.org ↔ DCAT alignment mostly follows the W3C DCAT 3 [Alignment with Schema.org](https://www.w3.org/TR/vocab-dcat-3/#dcat-sdo) appendix.

## Getting started

### Validate dataset descriptions

Dataset descriptions must adhere to the [Requirements for Datasets](https://netwerk-digitaal-erfgoed.github.io/requirements-datasets/).
You can check validity using the [validate API call](https://datasetregister.netwerkdigitaalerfgoed.nl/api#/default/validate).

### Submit dataset descriptions

To submit your dataset descriptions to the Dataset Register,
use the [datasets API call](https://datasetregister.netwerkdigitaalerfgoed.nl/api#/default/post_datasets).
URLs must be [allowed](https://docs.nde.nl/services/dataset-register/data-model#allow-list) before they can be added to the Register.

### Search dataset descriptions

You can retrieve dataset descriptions registered by yourself and others from the SPARQL endpoint at `https://datasetregister.netwerkdigitaalerfgoed.nl/sparql`.

For example using [Comunica](https://comunica.dev):

    comunica-sparql sparql@https://datasetregister.netwerkdigitaalerfgoed.nl/sparql 'select * {?s a <http://www.w3.org/ns/dcat#Dataset> . ?s ?p ?o . } limit 100'

Or curl:

    curl -H Accept:application/sparql-results+json --data-urlencode 'query=select * {?s a <http://www.w3.org/ns/dcat#Dataset> . ?s ?p ?o . } limit 100' https://datasetregister.netwerkdigitaalerfgoed.nl/sparql

### Automate registrations

If you want to automate dataset descriptions registrations
by connecting your (collection management) application to the Dataset Register,
please see the [HTTP API documentation](https://datasetregister.netwerkdigitaalerfgoed.nl/api).

## Run the application

To run the application yourself (for instance if you’d like to contribute, which you’re very welcome to do),
follow these steps.
(As mentioned above, find the hosted version at https://datasetregister.netwerkdigitaalerfgoed.nl/api).

This application stores data in a [QLever](https://github.com/ad-freiburg/qlever) SPARQL store,
so you need to have that running locally:

```
docker compose up
```

You can then open a local QLever UI at http://localhost:7002/default.

With QLever running, you can start the application in development mode. Clone this repository and run:

```
npm install

# Run the API app:
npx nx serve api

# Run the crawler app:
npx nx serve crawler
```

### Run in production

To run the application in production, first compile and then run it. You may want to disable logging, which is enabled
by default:

```
npx nx build api --configuration=production
LOG=false npm start
```

### Configuration

You can configure the application through environment variables:

- `SPARQL_URL`: URL to the SPARQL store.
- `SPARQL_ACCESS_TOKEN`: access token for write operations on SPARQL Store (default: `SECRET_TOKEN`).
- `LOG`: enable/disable logging (default: `true`).
- `CRAWLER_SCHEDULE`: a schedule in Cron format; for example `0 * * * *` to [crawl](#crawler) every hour
  (default: crawling disabled).
- `REGISTRATION_URL_TTL`: if crawling is enabled, a registered URL’s maximum age (in seconds) before it is fetched again
  (default: `86400`, so one day).
- `HTTP_REQUEST_TIMEOUT`: the per-request HTTP timeout (in seconds, minimum `1`) applied to every page fetched while
  dereferencing and paginating a registration URL. Each page gets its own fresh deadline, so a slow or trickling host
  cannot hold a request open indefinitely and stall the crawl, while a large healthy paginated catalogue is not cut off
  mid-traversal. When a request times out the registration is left untouched and retried on the next pass, rather than
  being recorded as gone (default: `30`).
- `CRAWLER_MAX_DISTRIBUTION_PROBES`: the maximum number of distinct distribution endpoints probed per dataset (minimum
  `1`). A single dataset can declare tens of thousands of distributions; probing every endpoint stalls a crawl pass for
  hours. Endpoints beyond the cap are skipped and the skipped count is logged, never silently dropped (default: `100`).
- `TYPESENSE_HOST`, `TYPESENSE_PORT`, `TYPESENSE_PROTOCOL`, `TYPESENSE_API_KEY`: connection to the
  [Typesense](https://typesense.org) [search index](#search-index). When `TYPESENSE_HOST` and `TYPESENSE_API_KEY` are
  both set, the crawler rebuilds the index after each crawl; leave them unset to run without search. `TYPESENSE_API_KEY`
  is the admin key used to write the index (the bundled `docker compose` Typesense defaults to `dev-typesense-key`).
- `KNOWLEDGE_GRAPH_URL`: SPARQL endpoint of the Dataset Knowledge Graph used to enrich the
  [search index](#search-index) (facets such as class, terminology source and size, and the NDE-compatibility flags).
  Defaults to the public NDE endpoint; a failed or unreachable read degrades to a register-only index.

## Run the tests

The tests are run automatically [on CI](.github/workflows/qa.yml).

To run the tests locally, clone this repository, then:

```
npm install
npm test
```

## Components

### Crawler

The crawler will periodically fetch registration URLs ([`schema:EntryPoint`](https://docs.nde.nl/services/dataset-register/data-model#schemaentrypoint)) to update the dataset descriptions stored in the Dataset Register.

To enable the crawler, set [the `CRAWLER_SCHEDULE` configuration variable](#configuration).
The crawler will then check all registration URLs according to that schedule to see if any of the URLs have become outdated.
A registration URL is considered outdated if it has been last read longer than
[`REGISTRATION_URL_TTL`](#configuration) ago (its `schema:dateRead` is older).

If any outdated registration URLs are found, they are fetched and updated in the SPARQL store.

### Search index

The browser’s faceted search is served by a [Typesense](https://typesense.org) index (a `datasets` collection)
rather than by SPARQL `CONTAINS`, for better recall (typo tolerance, stemming, diacritics and synonyms). The
`search-indexer` projects every registered dataset from the SPARQL store, enriched with facets from the Dataset
Knowledge Graph ([`KNOWLEDGE_GRAPH_URL`](#configuration)), into a flat search document and rebuilds the index
blue/green: it builds a fresh collection, then atomically repoints an alias, so the live index is never partial. A
sidecar `labels` collection maps facet-value IRIs (organizations, classes, terminology sources) to display labels. The
rebuild is single-flight per index (a cross-pod lock held in Typesense), so the crawler and API replicas never rebuild
concurrently.

`docker compose up` starts Typesense (alongside QLever) on `localhost:8108`, and the committed `.env` files already
point the crawler and the browser at it, so local search works out of the box. The [crawler](#crawler) rebuilds the
index in-process after each crawl, reading the whole store each time, so a local index is built simply by running the
crawler:

```
npx nx serve crawler
```

Without a `CRAWLER_SCHEDULE` this performs a single crawl and one full rebuild from the current store. Set
[`KNOWLEDGE_GRAPH_URL`](#configuration) to enrich the index with Knowledge Graph facets, and the
[`TYPESENSE_*` variables](#configuration) to point at a non-local Typesense.

The browser queries Typesense directly with a **search-only** key, configured through its own public environment
variables (`PUBLIC_TYPESENSE_HOST`, `PUBLIC_TYPESENSE_PORT`, `PUBLIC_TYPESENSE_PROTOCOL` and
`PUBLIC_TYPESENSE_SEARCH_ONLY_API_KEY`), preset for local use in `apps/browser/.env`. Locally the admin key doubles as
the search key; in production, generate a scoped
[search-only API key](https://typesense.org/docs/latest/api/api-keys.html) so the write key never reaches the browser.

## Data model

The data model — including the `schema:EntryPoint`, `schema:Dataset`, `schema:contentRating`,
`dcat:Dataset`, `foaf:Organization`, and `dcat:Distribution` shapes, their alignment with
[DCAT-AP-NL 3.0](https://docs.geostandaarden.nl/dcat/dcat-ap-nl30/), and the allow list — is
documented at https://docs.nde.nl/services/dataset-register/data-model.
