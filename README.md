# Registry API

This is the API for the Registry.

For a demo application using this API, see https://demo.netwerkdigitaalerfgoed.nl/register/.

The backlog is also available at the [project board](https://github.com/orgs/netwerk-digitaal-erfgoed/projects/1?card_filter_query=repo%3Anetwerk-digitaal-erfgoed%2Fregistry-api).

## Run the application

This application stores data in the [GraphDB](https://graphdb.ontotext.com) RDF store,
so you need to have that running locally.

You can [do so in two ways]:

- either [install GraphDB for your OS](https://graphdb.ontotext.com/documentation/free/quick-start-guide.html);
- or run it in a Docker container:
    ```
    docker run -p 7200:7200 docker-registry.ontotext.com/graphdb-free:9.5.0-adoptopenjdk11
    ```

When GraphDB runs, you can start the application in development mode:

```
npm install
npm run dev
```

To run the application in production, first compile and then run it.
You may want to disable logging, which is enabled by default:

```
npm run compile
LOG=false npm run
```

### Configuration

You can configure the application through environment variables:

- `GRAPHDB_URL`: the URL at which your GraphDB instance runs (default: `http://localhost:7200`).
- `GRAPHDB_USERNAME`: if using authentication, your GraphDB username (default: empty).
- `GRAPHDB_PASSWORD`: if using authentication, your GraphDB password (default: empty).
- `LOG`: enable/disable logging (default: `true`).
