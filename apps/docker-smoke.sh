#!/usr/bin/env bash
#
# Smoke-test a built application image by actually running it and asserting it
# reaches startup. `nx … docker:build` only *builds* the image, so a runtime-only
# failure – e.g. a runtime dependency missing from the pruned image, surfacing as
# `ERR_MODULE_NOT_FOUND` at boot – passes the build yet crashes in production (the
# #2128 incident). This is the gate that catches that class before it ships.
#
# For HTTP server images an optional <http-path> additionally asserts that the
# running container serves that path AND a client asset it references (a
# /_app/immutable/*.js chunk) with HTTP 200. `node build` can boot fine yet 404
# every /_app asset if the build is broken (the adapter-node 5.5.5 regression,
# sveltejs/kit#16095); a log-only check would miss that, so we probe real HTTP.
#
# Usage: docker-smoke.sh <image-tag> <startup-log-regex> [http-path] [container-port]
set -euo pipefail

image="$1"
startup_pattern="$2"
http_path="${3:-}"
container_port="${4:-3000}"
container="smoke-${image}-$$"

cleanup() { docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT

# A superset of both apps' required env. Values are dummy: we test module
# resolution and startup, not behaviour. SPARQL stores connect lazily, so an
# unreachable URL does not block boot. CRAWLER_SCHEDULE keeps the crawler
# scheduling (idle) instead of crawling the dummy endpoint on startup. Setting
# TYPESENSE_* exercises the search-indexer import chain that #2128 broke.
# Extra args (e.g. a port publish) are forwarded via "$@"; passing none is safe
# under `set -u`, unlike an empty array on older bash.
run_container() {
  docker run -d --name "$container" "$@" \
    -e SPARQL_URL=http://example.invalid/sparql \
    -e SPARQL_ACCESS_TOKEN=dummy \
    -e CRAWLER_SCHEDULE="0 0 * * *" \
    -e TYPESENSE_HOST=localhost \
    -e TYPESENSE_API_KEY=dummy \
    "$image" >/dev/null
}

# Publish the HTTP port (to a random host port) only when an HTTP probe is asked
# for, so log-only smokes (crawler, api) keep their original behaviour.
if [ -n "$http_path" ]; then
  run_container -p "$container_port"
else
  run_container
fi

# Assert the running container serves <http-path> and a /_app asset it references,
# both with HTTP 200. Exits the script non-zero on any failure.
http_check() {
  local base host_port asset path_code asset_code html
  host_port="$(docker port "$container" "${container_port}/tcp" | head -1 | sed 's/.*://')"
  if [ -z "$host_port" ]; then
    echo "FAIL: $image did not publish container port $container_port"
    exit 1
  fi
  base="http://localhost:${host_port}"

  path_code="$(curl -s -o /dev/null -w '%{http_code}' "${base}${http_path}" || true)"
  if [ "$path_code" != "200" ]; then
    echo "FAIL: $image served ${http_path} with HTTP ${path_code:-000} (expected 200)"
    exit 1
  fi

  html="$(curl -s "${base}${http_path}" || true)"
  asset="$(printf '%s' "$html" | grep -oE '/_app/immutable/[^"]+\.js' | head -1 || true)"
  if [ -z "$asset" ]; then
    echo "FAIL: $image served ${http_path} but it references no /_app/immutable/*.js asset"
    exit 1
  fi

  asset_code="$(curl -s -o /dev/null -w '%{http_code}' "${base}${asset}" || true)"
  if [ "$asset_code" != "200" ]; then
    echo "FAIL: $image served the page but 404'd its client asset ${asset} (HTTP ${asset_code:-000}) — broken static serving"
    exit 1
  fi
  echo "PASS: $image serves ${http_path} and ${asset} with HTTP 200"
}

for _ in $(seq 1 30); do
  logs="$(docker logs "$container" 2>&1)"
  # Check failure conditions before success: a container that logged the startup
  # line and then crashed must be reported FAIL, not PASS, so liveness is gated
  # ahead of the startup match.
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
  if echo "$logs" | grep -qE "$startup_pattern"; then
    if [ -n "$http_path" ]; then
      http_check
    fi
    echo "PASS: $image reached startup (matched /$startup_pattern/)"
    exit 0
  fi
  sleep 1
done

echo "FAIL: $image did not reach startup within 30s:"
docker logs "$container" 2>&1
exit 1
