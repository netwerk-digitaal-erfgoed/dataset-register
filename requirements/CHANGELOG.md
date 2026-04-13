# Changelog

## [1.5.2](https://github.com/netwerk-digitaal-erfgoed/dataset-register/compare/requirements-1.5.1...requirements-1.5.2) (2026-04-13)


### Bug Fixes

* **shacl:** align publisher cardinality with DCAT-AP-NL 3.0 ([#1842](https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1842)) ([6af64c7](https://github.com/netwerk-digitaal-erfgoed/dataset-register/commit/6af64c73d26b7fe28dcf33244c92454f7814037c))
* **shacl:** drop incorrect sh:minCount 1 from distribution license v2.0 future change ([#1834](https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1834)) ([5309cfb](https://github.com/netwerk-digitaal-erfgoed/dataset-register/commit/5309cfb9bd572fc30fa210c06bf80284278ba5c8))
* **shacl:** flatten nested validation via sh:targetObjectsOf ([#1830](https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1830)) ([6d28deb](https://github.com/netwerk-digitaal-erfgoed/dataset-register/commit/6d28deb0661ef7e0992efeb391d5eb3655ed7a03))
* **shacl:** mark ISO-8601 date pattern as v2.0 violation ([#1836](https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1836)) ([62d22e1](https://github.com/netwerk-digitaal-erfgoed/dataset-register/commit/62d22e1bd2a22b4d946ebe1ad82f43481877a19a))
* **shacl:** mark schema:contactPoint as v2.0 violation ([#1835](https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1835)) ([7aeab03](https://github.com/netwerk-digitaal-erfgoed/dataset-register/commit/7aeab03631f524ec2686d92713bc04f8a3ae9001))
* **shacl:** validate ISO-8601 dates on DCAT date properties ([#1839](https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1839)) ([ee09aec](https://github.com/netwerk-digitaal-erfgoed/dataset-register/commit/ee09aec487d8997ef50dc7ec807cda9f634b7c85))
* **spec:** suppress contradictory ‘becomes required’ note on already-required properties ([#1843](https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1843)) ([600a62c](https://github.com/netwerk-digitaal-erfgoed/dataset-register/commit/600a62c86361a5716a33952b81852475b6fbe8dc))


### Documentation

* **spec:** populate attribute tables and normalize URI to IRI ([#1844](https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1844)) ([c6465e3](https://github.com/netwerk-digitaal-erfgoed/dataset-register/commit/c6465e3a263afecb2dcd25a649bd4e11a4b52ac5))

## [1.5.1](https://github.com/netwerk-digitaal-erfgoed/dataset-register/compare/requirements-1.5.0...requirements-1.5.1) (2026-04-10)


### Bug Fixes

* correct v2.0 annotation for IRI-constrained properties in spec ([#1825](https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1825)) ([63e694a](https://github.com/netwerk-digitaal-erfgoed/dataset-register/commit/63e694a7256b3666dbe3e2d64cc3207c65ddb81c))
* **requirements:** use single sh:message on SPARQL constraint for Jena compatibility ([#1802](https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1802)) ([5e67a50](https://github.com/netwerk-digitaal-erfgoed/dataset-register/commit/5e67a5004888e0d04690eb906f3bb543ca28425e))


### Documentation

* add resolvable dataset URI requirement and update mainEntityOfPage ([#1821](https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1821)) ([59f995d](https://github.com/netwerk-digitaal-erfgoed/dataset-register/commit/59f995ded5d4ae48f4b60160fc0e5a75e7901a61))

## [1.5.0](https://github.com/netwerk-digitaal-erfgoed/dataset-register/compare/requirements-1.4.0...requirements-1.5.0) (2026-04-02)


### Features

* **requirements:** recommended a set of canonical license URIs ([#1797](https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1797)) ([ec38c3a](https://github.com/netwerk-digitaal-erfgoed/dataset-register/commit/ec38c3ac4c5ebdcdded7d816e4490156a399ee35))

## [1.4.0](https://github.com/netwerk-digitaal-erfgoed/dataset-register/compare/requirements-1.3.0...requirements-1.4.0) (2026-04-01)


### Features

* add Content-Type requirement for registration URLs ([#1794](https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1794)) ([524dc42](https://github.com/netwerk-digitaal-erfgoed/dataset-register/commit/524dc42e3ba7f75e0ac1d0b2f994c0c703190ec0))
* add dct:accrualPeriodicity support for datasets ([#1793](https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1793)) ([8eebd71](https://github.com/netwerk-digitaal-erfgoed/dataset-register/commit/8eebd71cb674a344016808a723ad89de33e4ccbb))
* add maxCount 1 as future change for encodingFormat and mediaType ([#1790](https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1790)) ([9364133](https://github.com/netwerk-digitaal-erfgoed/dataset-register/commit/9364133edc05b6f4c2a437bf40bb0321e50238d2))
* preserve user-provided dcat:theme from DCAT input ([#1788](https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1788)) ([343b176](https://github.com/netwerk-digitaal-erfgoed/dataset-register/commit/343b176b3ebad609e88ef3f33501196e95bf3c98))
* remove dct:title from Distribution ([#1784](https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1784)) ([d957e44](https://github.com/netwerk-digitaal-erfgoed/dataset-register/commit/d957e4410f2243d85714c832d89eaf2bf281339a))
* validate includedInDataCatalog as HTTP IRI ([#1786](https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1786)) ([08484c6](https://github.com/netwerk-digitaal-erfgoed/dataset-register/commit/08484c6c0e98dcb5afd17186187ef9dddd5b5527))
* validate language tags on title, description, and name properties ([#1791](https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1791)) ([d99f2fb](https://github.com/netwerk-digitaal-erfgoed/dataset-register/commit/d99f2fbc1662b7ccb09def714257ae6ec3c11e7c))
* validate spatialCoverage and dct:spatial as HTTP IRI ([#1787](https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1787)) ([bbc02b5](https://github.com/netwerk-digitaal-erfgoed/dataset-register/commit/bbc02b57d3a47276a4c4e564988b60777c71b8e1))


### Bug Fixes

* skip SHACL validation of inline DataCatalog references ([#1789](https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1789)) ([37c9437](https://github.com/netwerk-digitaal-erfgoed/dataset-register/commit/37c9437f5abfe2c6d859ca84939634fa104be7c4))


### Documentation

* rewrite ‘Developer documentation’ section as ‘Usage information’ ([#1785](https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1785)) ([ad5c22c](https://github.com/netwerk-digitaal-erfgoed/dataset-register/commit/ad5c22c42b5b6e50dfae662137e2af635622287e))

## [1.3.0](https://github.com/netwerk-digitaal-erfgoed/dataset-register/compare/requirements-1.2.0...requirements-1.3.0) (2026-04-01)

### Features

* **core:** differentiate API and download distributions per DCAT-AP-NL ([#1728](https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1728)) ([ba22143](https://github.com/netwerk-digitaal-erfgoed/dataset-register/commit/ba22143eb73aa8fb711b5b8892e15a080e7df398))
* **core:** normalize BCP 47 language codes to EU Language Authority URIs ([#1722](https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1722)) ([cbf1932](https://github.com/netwerk-digitaal-erfgoed/dataset-register/commit/cbf1932741db10d3aab784114a87383cd003d1b9))

### Bug Fixes

* **requirements:** add Person to conceptual model diagram ([#1727](https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1727)) ([cd0b429](https://github.com/netwerk-digitaal-erfgoed/dataset-register/commit/cd0b42909f6811bd1c6f3d450f46a06b4c024078))

## [1.2.0](https://github.com/netwerk-digitaal-erfgoed/dataset-register/compare/requirements-1.1.0...requirements-1.2.0) (2026-03-25)

### Features

* **requirements:** add DCAT-AP-NL 3.0 requirements ([#1719](https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1719)) ([510a43c](https://github.com/netwerk-digitaal-erfgoed/dataset-register/commit/510a43c23179b28b211ebd52bd6e1246e49e943e))

## [1.1.0](https://github.com/netwerk-digitaal-erfgoed/dataset-register/compare/requirements-1.0.0...requirements-1.1.0) (2026-03-25)

### Features

* **requirements:** express future requirement changes in SHACL and spec ([#1713](https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1713)) ([3c3fbb7](https://github.com/netwerk-digitaal-erfgoed/dataset-register/commit/3c3fbb70926aacf2662db7ca21c865e751de2b46))
