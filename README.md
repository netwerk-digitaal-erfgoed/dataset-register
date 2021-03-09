# Register

This is a prototype of the [NDE](https://www.netwerkdigitaalerfgoed.nl/en/about-us/) Register,
a service that helps users find and discover datasets.

Institutions (such as cultural heritage organizations) register their dataset descriptions with the NDE Register
using its HTTP API. The Register builds an index by fetching and periodically crawling dataset descriptions.

The HTTP API is documented at https://demo.netwerkdigitaalerfgoed.nl/register-api.

See the [Register Demonstrator](https://demo.netwerkdigitaalerfgoed.nl/register/),
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
You can check validity using the [validate API call](https://demo.netwerkdigitaalerfgoed.nl/register-api/static/index.html#/default/validate).

### Submit dataset descriptions

To submit your dataset descriptions to the Register,
use the [datasets API call](https://demo.netwerkdigitaalerfgoed.nl/register-api/static/index.html#/default/post_datasets).

### Search dataset descriptions

You can retrieve dataset descriptions registered by yourself and others
from our [triple store](http://triplestore.netwerkdigitaalerfgoed.nl).

### Automate registrations

If you want to automate dataset descriptions registrations
by connecting your (collection management) application to the Register,
please see the [HTTP API documentation](https://demo.netwerkdigitaalerfgoed.nl/register-api).

## Run the application

To run the application yourself (for instance if you’d like to contribute, which you’re very welcome to do),
follow these steps.
(As mentioned above, find the hosted version at https://demo.netwerkdigitaalerfgoed.nl/register-api).

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
- `CRAWLER_SCHEDULE`: a schedule in Cron format; for example `0 * * * *` to crawl every hour
  (default: crawling disabled).
- `REGISTRATION_URL_TTL`: if crawling is enabled, a registered URL’s maximum age before it is crawled again.

## Run the tests

To run the tests locally, clone this repository, then:

```
npm install
npm test
```
