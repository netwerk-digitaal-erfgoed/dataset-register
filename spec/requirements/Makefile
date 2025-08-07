help:
	@echo "Generate HTML from a Bikeshed source document:"
	@echo "  make spec    Generate HTML"
	@echo "  make watch   Generate HTML each time the source changes"

spec:
	docker run -v "`pwd`:/spec" -w /spec netwerkdigitaalerfgoed/bikeshed:5.3.2

watch:
	docker run -v "`pwd`:/spec" -w /spec netwerkdigitaalerfgoed/bikeshed:5.3.2 sh -c "bikeshed watch"
