# Browser

A faceted search app for finding datasets from the Netwerk Digitaal Erfgoed (NDE) Dataset Register.

## Data

This app retrieves data from the [NDE Dataset Register SPARQL endpoint](../../README.md#search-dataset-descriptions).

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

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.
