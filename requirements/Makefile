# The build comes from netwerk-digitaal-erfgoed/workflows, at the version that
# requirements-publish.yml pins for spec-boilerplate, so a local build matches CI.
NDE_WORKFLOWS_DIR ?= ../.github/workflows
NDE_REF := $(shell sed -n -E 's,.*netwerk-digitaal-erfgoed/workflows/(\.github/workflows/spec\.yml|spec-boilerplate)@([^[:space:]]+).*,\2,p' $(NDE_WORKFLOWS_DIR)/*.yml | head -n 1)
$(if $(NDE_REF),,$(error No spec.yml or spec-boilerplate version found in $(NDE_WORKFLOWS_DIR)))
NDE_DIR := .nde/$(NDE_REF)
NDE_MK := $(NDE_DIR)/spec-boilerplate/nde.mk

include $(NDE_MK)

# Downloads into a temporary folder that is moved into place when complete,
# so an interrupted download never leaves a partial copy behind.
$(NDE_MK):
	rm -rf $(NDE_DIR) $(NDE_DIR).download
	mkdir -p $(NDE_DIR).download
	curl -fsSL https://github.com/netwerk-digitaal-erfgoed/workflows/archive/$(NDE_REF).tar.gz | tar -xz -C $(NDE_DIR).download --strip-components=1
	mv $(NDE_DIR).download $(NDE_DIR)
