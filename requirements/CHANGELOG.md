# Changelog

## [1.11.0](https://github.com/netwerk-digitaal-erfgoed/dataset-register/compare/requirements-1.10.0...requirements-1.11.0) (2026-04-23)


### Features

* **shacl:** state temporal coverage format in description and validate dc:temporal ([#1920](https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1920)) ([f71bde4](https://github.com/netwerk-digitaal-erfgoed/dataset-register/commit/f71bde4bfaa75d1f4b99044d937fb8e959960624))

## [1.10.0](https://github.com/netwerk-digitaal-erfgoed/dataset-register/compare/requirements-1.9.0...requirements-1.10.0) (2026-04-23)


### Features

* **shacl:** add schema:documentation to distribution for documentation page URL ([#1917](https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1917)) ([8e30b05](https://github.com/netwerk-digitaal-erfgoed/dataset-register/commit/8e30b051098439d6fe79b417dd89b7c661b96365))


### Bug Fixes

* **shacl:** plain-HTML sh:description, spec-side Bikeshed expansion, drop sh:name ([#1915](https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1915)) ([28198fe](https://github.com/netwerk-digitaal-erfgoed/dataset-register/commit/28198fed8159e184dbed77e53fe8d5bd5bf7e4c9))
* **shacl:** use HTML anchors for links in sh:description ([#1910](https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1910)) ([49642a7](https://github.com/netwerk-digitaal-erfgoed/dataset-register/commit/49642a73c527516682048f66b829aeca2f8d4e88))
* **spec:** render maxCount 0 and ‘becomes forbidden’ in attribute tables ([#1916](https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1916)) ([47af7ce](https://github.com/netwerk-digitaal-erfgoed/dataset-register/commit/47af7cee78b0d4fe771b48e44f45bbd5cda51d4e))

## [1.9.0](https://github.com/netwerk-digitaal-erfgoed/dataset-register/compare/requirements-1.8.0...requirements-1.9.0) (2026-04-22)


### Features

* **shacl:** downgrade missing organisation identifier to sh:Info ([#1909](https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1909)) ([6624d71](https://github.com/netwerk-digitaal-erfgoed/dataset-register/commit/6624d71d903bdc4928e6abccd77e138a5ee558b4))
* **shacl:** recommend schema:about instead of schema:keywords for URIs  ([#1905](https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1905)) ([fcf9055](https://github.com/netwerk-digitaal-erfgoed/dataset-register/commit/fcf9055223a47f7d01d61282d07147e2865b6f34))


### Bug Fixes

* **shacl:** consolidate publisher/creator shapes ([#1892](https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1892)) ([b533f0a](https://github.com/netwerk-digitaal-erfgoed/dataset-register/commit/b533f0a4cff82e1f5c94973ece8c84e6f793fa5a))

## [1.8.0](https://github.com/netwerk-digitaal-erfgoed/dataset-register/compare/requirements-1.7.0...requirements-1.8.0) (2026-04-20)


### Features

* **shacl:** require SPARQL protocol URI in usageInfo for SPARQL mediaType ([#1873](https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1873)) ([0dfc6c6](https://github.com/netwerk-digitaal-erfgoed/dataset-register/commit/0dfc6c620a47a234ae5951a35e637d5a0cb7981f))


### Bug Fixes

* **core:** align Distribution with DCAT-AP-NL 3.0 (title + description) ([#1869](https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1869)) ([e901005](https://github.com/netwerk-digitaal-erfgoed/dataset-register/commit/e90100529b220aeed62cf98b2a025d4a5543dade))
* **shacl:** split publisher min/max-count constraints into separate shapes ([#1875](https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1875)) ([2e060e4](https://github.com/netwerk-digitaal-erfgoed/dataset-register/commit/2e060e4d6fef18890daa95374cf3818b78c02bff))

## [1.7.0](https://github.com/netwerk-digitaal-erfgoed/dataset-register/compare/requirements-1.6.0...requirements-1.7.0) (2026-04-20)


### Features

* **core:** map schema:temporalCoverage to dct:PeriodOfTime ([#1863](https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1863)) ([a700556](https://github.com/netwerk-digitaal-erfgoed/dataset-register/commit/a700556f29831d19d0780f43de0658639833c179))


### Bug Fixes

* **shacl:** accept ISO 8601 shortened-end intervals in temporalCoverage ([#1866](https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1866)) ([61ffdf7](https://github.com/netwerk-digitaal-erfgoed/dataset-register/commit/61ffdf7c4a302ad2795f16217d3fc44c03f3f378))

## [1.6.0](https://github.com/netwerk-digitaal-erfgoed/dataset-register/compare/requirements-1.5.3...requirements-1.6.0) (2026-04-16)


### Features

* **shacl:** deprecate schema:genre; make schema:about canonical for dcat:theme ([#1858](https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1858)) ([bdbd789](https://github.com/netwerk-digitaal-erfgoed/dataset-register/commit/bdbd78973b533f1ed7cddb0ef6e5e5118d77b85f))


### Bug Fixes

* **shacl:** target sh:nodeKind sh:IRI for contentUrl in v2, not xsd:anyURI ([#1854](https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1854)) ([1e86b9f](https://github.com/netwerk-digitaal-erfgoed/dataset-register/commit/1e86b9fa0df1b0f3e61b325c6c6e7d9954c185e1))

## [1.5.3](https://github.com/netwerk-digitaal-erfgoed/dataset-register/compare/requirements-1.5.2...requirements-1.5.3) (2026-04-15)


### Documentation

* **requirements:** add Linked Art profile to distribution IRI table ([#1851](https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1851)) ([3c01ad5](https://github.com/netwerk-digitaal-erfgoed/dataset-register/commit/3c01ad56526dc1582f0609a504188cde1541178b))

## [1.5.2](https://github.com/netwerk-digitaal-erfgoed/dataset-register/compare/requirements-1.5.1...requirements-1.5.2) (2026-04-13)


### Bug Fixes

* **shacl:** align publisher cardinality with DCAT-AP-NL 3.0 ([#1842](https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1842)) ([6af64c7](https://github.com/netwerk-digitaal-erfgoed/dataset-register/commit/6af64c73d26b7fe28dcf33244c92454f7814037c))
* **shacl:** mark ISO-8601 date pattern as v2.0 violation ([#1836](https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1836)) ([62d22e1](https://github.com/netwerk-digitaal-erfgoed/dataset-register/commit/62d22e1bd2a22b4d946ebe1ad82f43481877a19a))
* **shacl:** mark schema:contactPoint as v2.0 violation ([#1835](https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1835)) ([7aeab03](https://github.com/netwerk-digitaal-erfgoed/dataset-register/commit/7aeab03631f524ec2686d92713bc04f8a3ae9001))
* **shacl:** validate ISO-8601 dates on DCAT date properties ([#1839](https://github.com/netwerk-digitaal-erfgoed/dataset-register/issues/1839)) ([ee09aec](https://github.com/netwerk-digitaal-erfgoed/dataset-register/commit/ee09aec487d8997ef50dc7ec807cda9f634b7c85))


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
