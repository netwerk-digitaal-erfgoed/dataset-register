# Requirements for Datasets

This is the source code for the public document available at https://docs.nde.nl/requirements-datasets/.

## Building 

Build the spec:

```shell
npx --yes @lde/docgen@latest from-shacl shacl.ttl index.bs.liquid > index.bs
make spec
```

And view it:

```shell
open index.html
```

## Severity levels

We use SHACL severity levels for progressive tightening of requirements:

| `sh:severity`  | Keyword  | Effect                                                      |
|----------------|----------|-------------------------------------------------------------|
| `sh:Violation` | `MUST`   | Requirements that make validation fail                      |
| `sh:Warning`   | `MUST`   | Requirements that display as warnings in validation reports |
| `sh:Info`      | `SHOULD` | Recommendedations                                           |
