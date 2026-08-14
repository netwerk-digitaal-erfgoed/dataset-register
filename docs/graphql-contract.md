# GraphQL contract

`@dataset-register/core` declares search fields. The [public GraphQL search
API](https://datasetregister.netwerkdigitaalerfgoed.nl/graphql) is built from
those declarations at boot by
[`createSearchGraphQLHandler`](https://ldelements.org/reference/search-api-graphql),
so the surface consumers use comes out of a generator this repository does not
own.

The test suite covers those declarations: their names, paths, roles and
`derive` functions. Nothing in it builds the GraphQL schema, so nothing observes
what the generator turns them into. When `@lde/search` 0.18 moved paging under
`pagination`, renamed reference labels from `name` to `label` and changed the
boolean facets to carry a real boolean, every declaration test still passed –
and the change shipped as a dependency bump, unmarked and undocumented, with a
client-visible break in it.

`packages/core/search-schema.graphql` is that surface, committed. The
`graphql-contract` job regenerates it on every pull request that could move it,
and commits the difference to the branch.

## What that gives you

- a **diff in Files changed**, where a reviewer already looks, rather than a
  line in a CI log;
- a **history** of the published API, so “what changed between these releases”
  is a diff between two tags – the answer to give a consumer;
- a **`graphql-schema-change` label**, so it is visible in a listing without
  opening the pull request.

The label answers _does this pull request change the API_, not _was the file out
of date_: an author who regenerated it themselves leaves nothing to commit, so a
real API change would go unlabelled. It diffs the branch’s surface against the
base’s, once the branch’s is current.

Nothing to accept and nothing to run: merging the pull request is what adopts
the change.

## Not a check

It is a maintenance job. By the time it finishes the file always matches, so a
comparison could never fail – there is no red mark to chase, and it never blocks
a merge. It fails only if it cannot do its work, such as a rejected push.

One consequence: pushing to a Dependabot branch marks that pull request as
edited. Merge those rather than letting them sit.

## Reading the diff

The diff states the API change. A field or type that disappears, or is renamed,
is **breaking**: the commit that lands it needs a `!` or a `BREAKING CHANGE:`
footer, and the [GraphQL chapter of the docs
site](https://github.com/netwerk-digitaal-erfgoed/netwerk-digitaal-erfgoed.github.io/blob/main/docs/services/dataset-register/graphql.md)
needs updating in the same breath. A squash-merged dependency bump is still the
commit that lands the break.

Regenerate locally with `npx nx run @dataset-register/core:sdl`; never edit the
file by hand. It is printed from the same `SEARCH_SCHEMA` and
`SEARCH_SCHEMA_OPTIONS` the served endpoint builds its handler from, so it
cannot describe a different API from the one running – which is why
`queryDefaults` lives in `core` rather than at the endpoint.

The file is formatted with this repository’s own Prettier configuration, so the
pre-commit hook has nothing left to reformat – were the two to disagree, each
would undo the other and the job would commit a difference on every run. The
formatting also keeps a surface move readable: one field argument per line, so
adding an argument is one added line.

## Editors

`graphql.config.yml` points editors at the committed file rather than a running
endpoint, so validation works offline. It covers the browser’s search service,
where `DATASET_SEARCH_QUERY` lives.

## Limits

This reports the API’s **surface**, not its behaviour. A change that alters
neither a type nor a field is invisible here by design: adding a locale changes
what is indexed and stemmed, but localized text is `[LanguageString!]!` either
way. Nor does it prove the endpoint answers – that is what the
`apps/browser/src/routes/graphql` tests do, by driving the real route.
