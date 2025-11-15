#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "$0")/.." || exit 1

ROOT_PKG="package.json"
CLI_PKG="apps/cli/package.json"
WEB_PKG="apps/web/package.json"
SKAFF_PKG="packages/skaff-lib/package.json"
TEMPLATE_PKG="packages/template-types-lib/package.json"

if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq is required but not installed." >&2
  exit 1
fi

usage() {
  echo "Usage: $0 [enable|disable]"
  exit 1
}

run_jq_inplace() {
  local file="$1"
  shift
  local tmp
  tmp="$(mktemp)"
  jq "$@" "$file" > "$tmp"
  mv "$tmp" "$file"
}

enable_dev_mode() {
  echo "Enabling dev mode..."

  # apps/cli: use workspace:* for skaff-lib and template-types-lib
  run_jq_inplace "$CLI_PKG" '
    .dependencies["@timonteutelink/skaff-lib"] = "workspace:*"
  | .dependencies["@timonteutelink/template-types-lib"] = "workspace:*"
  '

  # apps/web: use workspace:* for skaff-lib and template-types-lib
  run_jq_inplace "$WEB_PKG" '
    .dependencies["@timonteutelink/skaff-lib"] = "workspace:*"
  | .dependencies["@timonteutelink/template-types-lib"] = "workspace:*"
  '

  # packages/skaff-lib: use workspace:* for template-types-lib
  run_jq_inplace "$SKAFF_PKG" '
    .dependencies["@timonteutelink/template-types-lib"] = "workspace:*"
  '

  # Root package.json: add workspaces entries for skaff-lib and template-types-lib
  run_jq_inplace "$ROOT_PKG" \
    --arg skaff "packages/skaff-lib" \
    --arg tmpl "packages/template-types-lib" '
    if (.workspaces | type) == "array" then
      .workspaces |= (. + [$skaff, $tmpl] | unique)
    elif (.workspaces | type) == "object" and (.workspaces.packages | type) == "array" then
      .workspaces.packages |= (. + [$skaff, $tmpl] | unique)
    else
      .
    end
  '

  echo "Dev mode enabled."
}

disable_dev_mode() {
  echo "Disabling dev mode..."

  # Read the actual versions from the local packages
  local skaff_version template_version
  skaff_version="$(jq -r '.version' "$SKAFF_PKG")"
  template_version="$(jq -r '.version' "$TEMPLATE_PKG")"

  if [[ -z "$skaff_version" || "$skaff_version" == "null" ]]; then
    echo "Error: Could not read version from $SKAFF_PKG" >&2
    exit 1
  fi
  if [[ -z "$template_version" || "$template_version" == "null" ]]; then
    echo "Error: Could not read version from $TEMPLATE_PKG" >&2
    exit 1
  fi

  # apps/cli: restore versions
  run_jq_inplace "$CLI_PKG" \
    --arg skaff "$skaff_version" \
    --arg tmpl "$template_version" '
    .dependencies["@timonteutelink/skaff-lib"] = $skaff
  | .dependencies["@timonteutelink/template-types-lib"] = $tmpl
  '

  # apps/web: restore versions
  run_jq_inplace "$WEB_PKG" \
    --arg skaff "$skaff_version" \
    --arg tmpl "$template_version" '
    .dependencies["@timonteutelink/skaff-lib"] = $skaff
  | .dependencies["@timonteutelink/template-types-lib"] = $tmpl
  '

  # packages/skaff-lib: restore template-types-lib version
  run_jq_inplace "$SKAFF_PKG" \
    --arg tmpl "$template_version" '
    .dependencies["@timonteutelink/template-types-lib"] = $tmpl
  '

  # Root package.json: remove workspaces entries for skaff-lib and template-types-lib
  run_jq_inplace "$ROOT_PKG" \
    --arg skaff "packages/skaff-lib" \
    --arg tmpl "packages/template-types-lib" '
    if (.workspaces | type) == "array" then
      .workspaces |= map(select(. != $skaff and . != $tmpl))
    elif (.workspaces | type) == "object" and (.workspaces.packages | type) == "array" then
      .workspaces.packages |= map(select(. != $skaff and . != $tmpl))
    else
      .
    end
  '

  echo "Dev mode disabled."
}

if [ $# -ne 1 ]; then
  usage
fi

case "$1" in
  enable)
    enable_dev_mode
    ;;
  disable)
    disable_dev_mode
    ;;
  *)
    usage
    ;;
esac

