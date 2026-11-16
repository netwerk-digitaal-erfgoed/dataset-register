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

### Local UI preview with public data

For UI work without a local search index, create `apps/browser/.env.local`:

```dotenv
PUBLIC_SEARCH_GRAPHQL_ENDPOINT=/__preview/graphql
```

Keep this file local (for example, exclude it in `.git/info/exclude`). Vite proxies
this development-only path to the public Dataset Register GraphQL API, avoiding
cross-origin preflight restrictions. The committed `.env` already points SPARQL
and dataset details at the public endpoints. This setup needs network access;
it does not run a local API, crawler or database.

Use Node.js 24 or newer and start the UI from the repository root:

```sh
npm ci
npm run dev --workspace=@dataset-register/browser -- --host 127.0.0.1 --port 4174 --strictPort
```

Open http://127.0.0.1:4174/datasets. Port 4174 leaves the LDForge preview on 4173
available alongside this app.

## Build

To create a production version of the app:

```sh
nx build browser
```

## SPARQL query page (LDForge)

The SPARQL button opens `/query` within the website, retaining its example query
and `exec=true` to run it. Direct visits to `/query` show the example without
automatically executing it. Shared LDForge links retain the query in the URL.
The page uses `PUBLIC_SPARQL_ENDPOINT`; `/sparql` remains the API endpoint.
The editor is lazy-loaded in the browser and destroyed on navigation.

The dataset page’s Query this dataset button opens `/query?dataset=…&endpoint=…`,
which runs queries against that dataset’s own SPARQL endpoint instead. The page
checks that the register lists the endpoint as one of the dataset’s SPARQL
distributions and returns 404 otherwise, so a link cannot point the editor at an
arbitrary server. It starts with a generic query and leaves out the register’s
examples and index information.

By default, development and production use the declared `@ldforge/*` npm packages.
To work against a local LDForge checkout, add this to `apps/browser/.env.local`:

```dotenv
LDFORGE_SOURCE=/absolute/path/to/LDForge
```

Restart the development server after changing this setting. Vite resolves the
LDForge packages and editor CSS directly from that checkout's `packages/*/src`,
so source edits participate in Vite's reload cycle without rebuilding packages.
Run `npm ci` in both repositories first. No `npm link` or `file:` dependencies
are needed. Remove `LDFORGE_SOURCE` to return to npm packages; production builds
always use npm, even when the local setting is present.

### Plugin showcase queries

The Examples menu includes live queries for tables, dataset cards, bar/line/doughnut
charts, publisher networks, registration timelines, format pivot tables, publisher
trees, ASK booleans and JSON. Query comments select the matching plugin with
`# view=…`; selecting an example loads it, and Run executes it. The original five
administrative queries remain above the divider.

Each example is a `.rq` file in `src/lib/services/sparql-examples/`: `admin/` above
the divider, `showcase/` below it. Files sort by their numeric prefix, and the rest
of the file name is the example’s id. The first lines hold the menu labels, which
are stripped from the query:

```sparql
# label-en: Most recent registrations
# label-nl: Meest recente registraties
```

To add an example, add a file; the tests check that every example parses.

These examples select their publishers and datasets from the current register;
they contain no fixed `VALUES` data. Counts use distinct datasets where joins can
multiply rows. The pivot counts a dataset in each format it offers, so row totals
are format occurrences rather than unique dataset totals. The monthly chart
contains months represented by current registration URLs, not an event history;
months without registrations are omitted. Ratings describe metadata completeness.

The map example federates to Wikidata using a SPARQL `SERVICE` clause. It matches
publishers' `schema:location` GeoNames IDs to Wikidata `P1566`, restricts places to
the Netherlands (`P17/Q55`), and retrieves Dutch labels and live `P625` coordinates.
Each marker represents a matched place and lists its publishers; it is a place
centre, not an exact publisher address. Publishers with no matching location are
omitted. This example depends on the register supporting federation and on
Wikidata availability; it contains no fixed place or coordinate table.

The publisher popup keeps publishers as structured bindings and renders one marker
per place. The popup has one Show datasets action for all its publishers. It opens and runs
a combined query in a new editor tab, preserving the map tab. This uses the
`renderPopup` API from `@ldforge/geo`. All declared LDForge minimum versions
target MIT-licensed releases: editor 1.2.1, geo and renderers 1.1.1, and the
remaining packages 1.0.1. These include keyboard help and full-height tables with
optional scrolling. Development can still override these
packages with `LDFORGE_SOURCE`.

The NDE toolbar's Index information button opens a dialog with the configured
endpoint's live `?cmd=stats` response. It shows the index name and normal counts
for triples, subjects, predicates and objects, omitting QLever's internal counts.
Requests are cancelled when the dialog closes; failures have a retry action.
