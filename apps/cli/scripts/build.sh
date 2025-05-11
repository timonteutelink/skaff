#!/usr/bin/env bash

cd "$(dirname "$0")/.." || exit 1

rm -r ../../node_modules

deno cache -r npm:@timonteutelink/template-types-lib
deno compile --output=./code-templator --allow-sys=hostname --allow-write --allow-run --import-map=./import_map.json --allow-net --allow-env --allow-read --unstable-sloppy-imports src/main.ts
