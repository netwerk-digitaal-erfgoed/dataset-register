# Browser

A faceted search app for finding datasets from the Netwerk Digitaal Erfgoed (NDE) Dataset Register.

## Functionality

- This app retrieves data from both the NDE [Dataset Register SPARQL endpoint](../../README.md#search-dataset-descriptions)
  and [Dataset Knowledge Graph SPARQL endpoint](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph).
- Search state is kept in the URL, so users can bookmark and share search results.

## Tech stack

- A SvelteKit 2 app with Tailwind CSS.
- Paraglide is used for translations.
- Relies on [@lde/dataset-registry-client](https://www.npmjs.com/package/@lde/dataset-registry-client)
  and [LDKit](https://ldkit.io) for retrieving and mapping data.

## Development

```sh
nx dev browser

# or start the server and open the app in a new browser tab
nx dev browser -- --open
```

## Build

To create a production version of the app:

```sh
nx build browser
```
