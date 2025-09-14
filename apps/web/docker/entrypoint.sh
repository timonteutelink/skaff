#!/usr/bin/env bash
set -euo pipefail

# GIT_USER=${GIT_USER:-skaff-webui}
# GIT_EMAIL=${GIT_EMAIL:-timon+skaff@teutelink.nl}

APP_UID=${APP_UID:-1001}
APP_GID=${APP_GID:-1001}

mkdir -p /projects

chown -R "${APP_UID}:${APP_GID}" /projects || true

# gosu nextjs:nodejs git config --global user.email "${GIT_EMAIL}"
# gosu nextjs:nodejs git config --global user.name "${GIT_USER}"

exec gosu nextjs:nodejs "$@"

