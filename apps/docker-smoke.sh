#!/usr/bin/env bash
#
# Smoke-test a built application image by actually running it and asserting it
# reaches startup. `nx … docker:build` only *builds* the image, so a runtime-only
# failure — e.g. a runtime dependency missing from the pruned image, surfacing as
# `ERR_MODULE_NOT_FOUND` at boot — passes the build yet crashes in production (the
# #2128 incident). This is the gate that catches that class before it ships.
#
# Usage: docker-smoke.sh <image-tag> <startup-log-regex>
set -euo pipefail

image="$1"
startup_pattern="$2"
container="smoke-${image}-$$"

cleanup() { docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT

# A superset of both apps' required env. Values are dummy: we test module
# resolution and startup, not behaviour. SPARQL stores connect lazily, so an
# unreachable URL does not block boot. CRAWLER_SCHEDULE keeps the crawler
# scheduling (idle) instead of crawling the dummy endpoint on startup. Setting
# TYPESENSE_* exercises the search-indexer import chain that #2128 broke.
docker run -d --name "$container" \
  -e SPARQL_URL=http://example.invalid/sparql \
  -e SPARQL_ACCESS_TOKEN=dummy \
  -e CRAWLER_SCHEDULE="0 0 * * *" \
  -e TYPESENSE_HOST=localhost \
  -e TYPESENSE_API_KEY=dummy \
  "$image" >/dev/null

for _ in $(seq 1 30); do
  logs="$(docker logs "$container" 2>&1)"
  if echo "$logs" | grep -qE "$startup_pattern"; then
    echo "PASS: $image reached startup (matched /$startup_pattern/)"
    exit 0
  fi
  if echo "$logs" | grep -qiE "ERR_MODULE_NOT_FOUND|Cannot find (package|module)"; then
    echo "FAIL: $image hit a module-resolution error at startup:"
    echo "$logs"
    exit 1
  fi
  if [ "$(docker inspect -f '{{.State.Status}}' "$container")" = "exited" ]; then
    echo "FAIL: $image exited before reaching startup:"
    echo "$logs"
    exit 1
  fi
  sleep 1
done

echo "FAIL: $image did not reach startup within 30s:"
docker logs "$container" 2>&1
exit 1
