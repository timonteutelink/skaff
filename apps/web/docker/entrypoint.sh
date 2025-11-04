#!/usr/bin/env bash
set -euo pipefail

APP_UID=${APP_UID:-1001}
APP_GID=${APP_GID:-1001}

mkdir -p /projects

chown -R "${APP_UID}:${APP_GID}" /projects || true

exec gosu nextjs:nodejs "$@"

