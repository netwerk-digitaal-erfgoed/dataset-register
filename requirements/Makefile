# The build comes from netwerk-digitaal-erfgoed/workflows, at the version that
# requirements-publish.yml pins for spec.yml, so a local build matches CI.
NDE_WORKFLOWS_DIR ?= ../.github/workflows
NDE_REF := $(shell sed -n -E 's,.*netwerk-digitaal-erfgoed/workflows/(\.github/workflows/spec\.yml|spec-boilerplate)@([^[:space:]]+).*,\2,p' $(NDE_WORKFLOWS_DIR)/*.yml | head -n 1)
include .nde/$(or $(NDE_REF),$(error No spec.yml version found in $(NDE_WORKFLOWS_DIR)))/spec-boilerplate/nde.mk

# Extracts into a temporary folder that is moved into place when complete, so an
# interrupted download never leaves a partial copy behind.
.nde/%/spec-boilerplate/nde.mk:
	rm -rf .nde/$* .nde/$*.download
	mkdir -p .nde/$*.download
	curl -fsSL -o .nde/$*.tar.gz https://github.com/netwerk-digitaal-erfgoed/workflows/archive/$*.tar.gz
	tar -xzf .nde/$*.tar.gz -C .nde/$*.download --strip-components=1
	rm .nde/$*.tar.gz
	mv .nde/$*.download .nde/$*
