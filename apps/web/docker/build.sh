#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "$0")/../../.."

docker build -t timonteutelink/code-templator:latest -f apps/web/docker/Dockerfile .
