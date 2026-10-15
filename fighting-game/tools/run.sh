#!/bin/sh
# Bundle and run a headless test script: tools/run.sh tech "0,1" 3
# (tech: fight stats per preset; push: push recovery; getup: fall and rise;
#  aim: strike speeds on a static target; falls: fall types; plans: time in each plan)
set -e
cd "$(dirname "$0")/.."
name="$1"; shift
out="${TMPDIR:-/tmp}/fg-$name.cjs"
node_modules/.bin/esbuild "tools/$name.ts" --bundle --platform=node --outfile="$out" --log-level=warning
node "$out" "$@"
