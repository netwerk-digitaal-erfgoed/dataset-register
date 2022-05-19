# Dataset Register

This is a prototype of the [NDE](https://www.netwerkdigitaalerfgoed.nl/en/about-us/) Dataset Register,
a service that helps users find and discover datasets.

Institutions (such as cultural heritage organizations) register their dataset descriptions with the NDE Dataset Register
using its HTTP API. The Dataset Register builds an index by fetching and periodically [crawling](#crawler) dataset descriptions.

The HTTP API is documented at https://datasetregister.netwerkdigitaalerfgoed.nl/api.

See the [Dataset Register Demonstrator](https://datasetregister.netwerkdigitaalerfgoed.nl),
a demo application using this prototype, for more background information (in Dutch).

## Design principles

1. The application follows modern standards and best practices.
2. The application uses [Linked Data Platform (LDP)](https://www.w3.org/TR/ldp/) for HTTP operations.
3. The application prefers [JSON-LD](http://json-ld.org) as the data exchange format.
4. The application uses established Linked Data vocabularies,
   including [Schema.org](https://schema.org) and [DCAT](https://www.w3.org/TR/vocab-dcat-2/).

## Getting started

### Validate dataset descriptions

Dataset descriptions must adhere to the [Requirements for Datasets](https://netwerk-digitaal-erfgoed.github.io/requirements-datasets/).
You can check validity using the [validate API call](https://datasetregister.netwerkdigitaalerfgoed.nl/api/static/index.html#/default/validate).

### Submit dataset descriptions

To submit your dataset descriptions to the Dataset Register,
use the [datasets API call](https://datasetregister.netwerkdigitaalerfgoed.nl/api/static/index.html#/default/post_datasets).
URLs must be [allowed](#allow-list) before they can be added to the Register.

### Search dataset descriptions

You can retrieve dataset descriptions registered by yourself and others
from our [triple store](https://triplestore.netwerkdigitaalerfgoed.nl/sparql?savedQueryName=Full%20dataset%20descriptions%20for%20publisher&owner=admin).

### Automate registrations

If you want to automate dataset descriptions registrations
by connecting your (collection management) application to the Dataset Register,
please see the [HTTP API documentation](https://datasetregister.netwerkdigitaalerfgoed.nl/api).

## Run the application

To run the application yourself (for instance if you’d like to contribute, which you’re very welcome to do),
follow these steps.
(As mentioned above, find the hosted version at https://datasetregister.netwerkdigitaalerfgoed.nl/api).

This application stores data in a [GraphDB](https://graphdb.ontotext.com) RDF store, so you need to have that running
locally:

```
docker run -p 7200:7200 docker-registry.ontotext.com/graphdb-free:9.6.0-adoptopenjdk11
```

When GraphDB runs, you can start the application in development mode. Clone this repository and run:

```
npm install
npm run dev
```

### Run in production

To run the application in production, first compile and then run it. You may want to disable logging, which is enabled
by default:

```
npm run compile
LOG=false npm start
```

### Configuration

You can configure the application through environment variables:

- `GRAPHDB_URL`: the URL at which your GraphDB instance runs (default: `http://localhost:7200`).
- `GRAPHDB_USERNAME`: if using authentication, your GraphDB username (default: empty).
- `GRAPHDB_PASSWORD`: if using authentication, your GraphDB password (default: empty).
- `LOG`: enable/disable logging (default: `true`).
- `CRAWLER_SCHEDULE`: a schedule in Cron format; for example `0 * * * *` to [crawl](#crawler) every hour
  (default: crawling disabled).
- `REGISTRATION_URL_TTL`: if crawling is enabled, a registered URL’s maximum age (in seconds) before it is fetched again
  (default: `86400`, so one day).

## Run the tests

The tests are run automatically [on CI](.github/workflows/qa.yml).

To run the tests locally, clone this repository, then:

```
npm install
npm test
```

## Components

### Crawler

The crawler will periodically fetch registration URLs ([`schema:EntryPoint`](#schemaentrypoint)) to update the dataset descriptions stored in the Dataset Register. 

To enable the crawler, set [the `CRAWLER_SCHEDULE` configuration variable](#configuration).
The crawler will then check all registration URLs according to that schedule to see if any of the URLs have become outdated.
A registration URL is considered outdated if it has been last read longer than
[`REGISTRATION_URL_TTL`](#configuration) ago (its `schema:dateRead` is older).

If any outdated registration URLs are found, they are fetched and updated in the RDF Store.

## Data model

### `schema:EntryPoint`

Any URL [registered by clients](#submit-dataset-descriptions) is added as a `schema:EntryPoint` to the
[Registrations graph](https://triplestore.netwerkdigitaalerfgoed.nl/resource?uri=https:%2F%2Fdemo.netwerkdigitaalerfgoed.nl%2Fregistry%2Fregistrations&role=context).

Datasets are fetched from this URL on registration and when [crawling](#crawler) it.

| Property | Description |
| ------------- | ------------- |
| [`schema:datePosted`](https://schema.org/datePosted) | When the URL was registered. |
| [`schema:dateRead`](https://schema.org/dateRead) | When the URL was last read by the application. The [crawler](#crawler) updates this value when fetching descriptions. |
| [`schema:status`](https://schema.org/status) | The HTTP status code last encountered when fetching the URL. |
| [`schema:validUntil`](https://schema.org/validUntil) | If the URL has become [invalid](#validate-dataset-descriptions), the date at which it did so. |
| [`schema:about`](https://schema.org/about) | The set of [`schema:Dataset`s](#schemadataset) that the URL contains. The [crawler](#crawler) updates this value when fetching descriptions. |

### `schema:Dataset`

Each dataset that is found at the [`schema:EntryPoint`](#schemaentrypoint) registration URL gets added as a
`schema:Dataset` to the 
[Registrations graph](https://triplestore.netwerkdigitaalerfgoed.nl/resource?uri=https:%2F%2Fdemo.netwerkdigitaalerfgoed.nl%2Fregistry%2Fregistrations&role=context).

| Property | Description |
| -------- | ----------- |
| [`schema:dateRead`](https://schema.org/dateRead) | When the dataset was last read by the application. |

### `dcat:Dataset`

When a dataset’s RDF description is fetched and validated, it is added as a `dcat:Dataset` to its own graph. The URL
of the graph corresponds to the dataset’s IRI.

If the dataset’s description is provided in Schema.org rather than DCAT, the description is first converted to DCAT. The
‘Based on’ column shows the corresponding Schema.org property.
See the [Requirements for Datasets](https://netwerk-digitaal-erfgoed.github.io/requirements-datasets/) for more details.

| Property | Description | Based on |
| -------- | ----------- | -------- |
| [`dct:title`](http://purl.org/dc/terms/title) | Dataset title. | [`schema:name`](https://schema.org/name) |
| [`dct:alternative`](http://purl.org/dc/terms/alternative) | Dataset alternate title. | [`schema:alternateName`](https://schema.org/alternateName) |
| [`dct:identifier`](http://purl.org/dc/terms/identifier) | Dataset identifier. | [`schema:identifier`](https://schema.org/identifier) |
| [`dct:description`](http://purl.org/dc/terms/description) | Dataset description. | [`schema:description`](https://schema.org/description) |
| [`dct:license`](http://purl.org/dc/terms/license) | Dataset license. | [`schema:license`](https://schema.org/license) |
| [`dct:language`](http://purl.org/dc/terms/language) | Language(s) in which the dataset is available. | [`schema:inLanguage`](https://schema.org/inLanguage) |
| [`dcat:keyword`](https://www.w3.org/TR/vocab-dcat-3/#Property:resource_keyword) | Keywords or tags that describe the dataset. | [`schema:keywords`](https://schema.org/keywords) |
| [`dcat:landingPage`](https://www.w3.org/TR/vocab-dcat-3/#Property:resource_landing_page) | URL of a webpage where the dataset is described. | [`schema:mainEntityOfPage`](https://schema.org/mainEntityOfPage) |
| [`dct:source`](http://purl.org/dc/terms/source) | URL(s) of datasets the dataset is based on. | [`schema:isBasedOn`](https://schema.org/isBasedOn) |
| [`dct:created`](http://purl.org/dc/terms/created) | Dataset creation date. | [`schema:dateCreated`](https://schema.org/dateCreated) |
| [`dct:issued`](http://purl.org/dc/terms/issued) | Dataset publication date. | [`schema:datePublished`](https://schema.org/datePublished) |
| [`dct:modified`](http://purl.org/dc/terms/modified) | Dataset last modification date. | [`schema:dateModified`](https://schema.org/dateModifed) |
| [`owl:versionInfo`](https://www.w3.org/2002/07/owl#versionInfo) | Dataset version | [`schema:version`](https://schema.org/version) |
| [`dct:creator`](http://purl.org/dc/terms/creator) | Dataset [creator](#foaforganization). | [`schema:creator`](https://schema.org/creator) |
| [`dct:publisher`](http://purl.org/dc/terms/publisher) | Dataset [publisher](#foaforganization). | [`schema:publisher`](https://schema.org/publisher) |
| [`dcat:distribution`](https://www.w3.org/TR/vocab-dcat-3/#Property:dataset_distribution) | Dataset [distributions](#dcatdistribution). | [`schema:distribution`](https://schema.org/distribution) |

### `foaf:Organization`

The objects of both the `dct:creator` and `dct:publisher` dataset have type `foaf:Organization`.

If the dataset’s organizations are provided in Schema.org rather than DCAT, the organizations are first converted to
DCAT. The ‘Based on’ column shows the corresponding Schema.org property.
See the [Requirements for Datasets](https://netwerk-digitaal-erfgoed.github.io/requirements-datasets/) for more details.

| Property | Description | Based on |
| -------- | ----------- | -------- |
| [`foaf:name`](http://xmlns.com/foaf/0.1/name) | Organization name. | [`schema:name`](https://schema.org/name) |


### `dcat:Distribution`

The objects of `dcat:distribution` dataset properties have type `dcat:Distribution`.

If the dataset’s distributions are provided in Schema.org rather than DCAT, the distributions are first converted to
DCAT. The ‘Based on’ column shows the corresponding Schema.org property.
See the [Requirements for Datasets](https://netwerk-digitaal-erfgoed.github.io/requirements-datasets/) for more details.

| Property                                                  | Description | Based on |
|-----------------------------------------------------------| ----------- | -------- |
| [`dcat:accessURL`](https://www.w3.org/TR/vocab-dcat-3/)   | Distribution URL. | [`schema:contentUrl`](https://schema.org/contentUrl) |
| [`dcat:mediaType`](https://www.w3.org/TR/vocab-dcat-3/)   | Distribution’s IANA media type. | [`schema:fileFormat`](https://schema.org/fileFormat) |
| [`dct:format`](http://purl.org/dc/terms/format)           | Distribution content type (e.g. `text/turtle`). | [`schema:encodingFormat`](https://schema.org/encodingFormat) |
| [`dct:issued`](http://purl.org/dc/terms/issued)           | Distribution publication date. | [`schema:datePublished`](https://schema.org/datePublished) |
| [`dct:modified`](http://purl.org/dc/terms/issued)         | Distribution last modification date. | [`schema:dateModified`](https://schema.org/dateModified) |
| [`dct:description`](http://purl.org/dc/terms/description) | Distribution description. | [`schema:description`](https://schema.org/description) |
| [`dct:language`](http://purl.org/dc/terms/language)       | Distribution language. | [`schema:inLanguage`](https://schema.org/inLanguage) |
| [`dct:license`](http://purl.org/dc/terms/license)         | Distribution license. | [`schema:license`](https://schema.org/license) |
| [`dct:title`](http://purl.org/dc/terms/title)             | Distribution title. | [`schema:name`](https://schema.org/name) |
| [`dcat:byteSize`](https://www.w3.org/TR/vocab-dcat-3/)    | Distribution’s download size in bytes. | [`schema:contentSize`](https://schema.org/contentSize) |

### Allow list

A registration URL must be on a domain that is allowed before it can be added to the Register.
Allowed domains are administered in the 
[https://data.netwerkdigitaalerfgoed.nl/registry/allowed_domain_names RDF graph](https://triplestore.netwerkdigitaalerfgoed.nl/resource?uri=https:%2F%2Fdata.netwerkdigitaalerfgoed.nl%2Fregistry%2Fallowed_domain_names&role=context).

To add a URL:

```sparql
INSERT DATA { 
    GRAPH <https://data.netwerkdigitaalerfgoed.nl/registry/allowed_domain_names> { 
        [] <https://data.netwerkdigitaalerfgoed.nl/allowed_domain_names/def/domain_name> "your-domain.com" .
    }
}
```
