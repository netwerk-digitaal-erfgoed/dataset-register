# Browser

A faceted search app for finding datasets from the Netwerk Digitaal Erfgoed (NDE) Dataset Register.

## Functionality

- This app retrieves data from both the NDE [Dataset Register SPARQL endpoint](../../README.md#search-dataset-descriptions)
  and [Dataset Knowledge Graph SPARQL endpoint](https://github.com/netwerk-digitaal-erfgoed/dataset-knowledge-graph).
- Search state is kept in the URL, so users can bookmark and share search results.
- Announcements on the [NDE status page](https://status.netwerkdigitaalerfgoed.nl) whose title starts with `[DR]` show
  as a banner at the top of every page, except the prerendered changelog. Set `UPTIMEROBOT_STATUS_PAGE_ID` and
  `UPTIMEROBOT_API_KEY` (a read-only UptimeRobot API key) to enable it; without them there is no banner.

## Tech stack

- A SvelteKit 2 app with Svelte 5 and Tailwind CSS.
- Paraglide is used for translations.
- Relies on [@lde/dataset-registry-client](https://www.npmjs.com/package/@lde/dataset-registry-client)
  and [LDKit](https://ldkit.io) for retrieving and mapping data.

## Development

```sh
nx dev browser

# or start the server and open the app in a new browser tab
nx dev browser -- --open
```

In the browser, navigate to http://localhost:{port}/datasets.

## Build

To create a production version of the app:

```sh
nx build browser
```
