# The build comes from netwerk-digitaal-erfgoed/workflows, at the version of
# spec-boilerplate that requirements-publish.yml pins, so a local build matches CI.
NDE_WORKFLOWS_DIR ?= ../.github/workflows
NDE_REF := $(shell sed -n -E 's,.*netwerk-digitaal-erfgoed/workflows/(\.github/workflows/spec\.yml|spec-boilerplate)@([^[:space:]]+).*,\2,p' $(NDE_WORKFLOWS_DIR)/*.yml | head -n 1)
$(if $(NDE_REF),,$(error No spec.yml or spec-boilerplate version found in $(NDE_WORKFLOWS_DIR)))
# Cache by commit, so a spec that follows a branch such as main gets each new commit.
# A commit SHA, or no network, leaves the ref as it is.
NDE_COMMIT := $(or $(shell git ls-remote https://github.com/netwerk-digitaal-erfgoed/workflows $(NDE_REF) 2>/dev/null | cut -f1 | head -n 1),$(NDE_REF))
NDE_DIR := .nde/$(NDE_COMMIT)
NDE_MK := $(NDE_DIR)/spec-boilerplate/nde.mk

include $(NDE_MK)

$(NDE_MK):
	mkdir -p $(NDE_DIR)
	curl -fsSL https://github.com/netwerk-digitaal-erfgoed/workflows/archive/$(NDE_COMMIT).tar.gz | tar -xz -C $(NDE_DIR) --strip-components=1
	npm ci --prefix $(NDE_DIR)/spec-boilerplate --no-audit --no-fund
