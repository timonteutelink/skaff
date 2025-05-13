#!/usr/bin/env bash

cd "$(dirname "$0")/.." || exit 1

bun build --compile --outfile=code-templator ./src/main.ts
