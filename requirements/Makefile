help:
	@echo "Generate HTML from a Bikeshed source document:"
	@echo "  make spec    Generate HTML"
	@echo "  make watch   Generate HTML each time the source changes"

spec:
	npx --yes @lde/docgen@latest from-shacl -f shacl.frame.jsonld shacl.ttl index.bs.liquid > index.bs
	docker run -v "`pwd`:/spec" -w /spec netwerkdigitaalerfgoed/bikeshed:latest

watch:
	npx --yes @lde/docgen@latest from-shacl -f shacl.frame.jsonld shacl.ttl index.bs.liquid > index.bs
	docker run -v "`pwd`:/spec" -w /spec netwerkdigitaalerfgoed/bikeshed:latest sh -c "bikeshed watch"
