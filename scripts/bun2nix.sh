#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "$0")/.." || exit 1

if ! command -v bun2nix &> /dev/null; then
  echo "Error: bun2nix is not installed." >&2
  exit 0 # Exit with 0 to not fail CI
fi

if [ ! -f bun.lock ]; then
  echo "Error: bun.lock file not found!" >&2
  exit 0
fi

json5 bun.lock | jq '
  .packages
  |= with_entries(
       select(.value[0]                                      # first tuple item …
              | test("^(@[^/]+/)?[^@]+@[0-9]")               # … matches name@ver?
             )
     )
' > bun.lock.clean

bun2nix -l bun.lock.clean -o ./nix/code-templator-package/bun-packages.nix

