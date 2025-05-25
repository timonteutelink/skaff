#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "$0")/.." || exit 1

json5 bun.lock | jq '
  .packages
  |= with_entries(
       select(.value[0]                                      # first tuple item …
              | test("^(@[^/]+/)?[^@]+@[0-9]")               # … matches name@ver?
             )
     )
' > bun.lock.clean

bun2nix -l bun.lock.clean -o ./nix/code-templator-package/bun-packages.nix

