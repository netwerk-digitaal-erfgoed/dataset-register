# Requirements for Datasets

This is the source code for the public document available at https://docs.nde.nl/requirements-datasets/.

## Building 

Build the spec:

```shell
make spec
```

The build comes from [spec-boilerplate](https://github.com/netwerk-digitaal-erfgoed/workflows/tree/main/spec-boilerplate), at the version that `.github/workflows/requirements-publish.yml` pins. The first `make spec` downloads that version into `.nde/`; it needs git, curl, tar, npm and Docker. `make spec` also fails when a template prints `[object Object]`, which used to be the separate `make check`.

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
| `sh:Info`      | `SHOULD` | Recommendations                                              |
