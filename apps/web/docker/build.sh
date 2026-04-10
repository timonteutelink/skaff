#!/usr/bin/env bash
#
# Skaff Web Docker Build Script
#
# Usage:
#   ./build.sh                           # Build without plugins
#   ./build.sh "plugin1 plugin2"         # Build with plugins
#
# Examples:
#   ./build.sh
#   ./build.sh "@skaff/plugin-greeter@1.0.0"
#   ./build.sh "@skaff/plugin-greeter @skaff/plugin-docker"
#
# Environment Variables:
#   SKAFF_PLUGINS    - Space-separated list of plugins to install
#   NPM_TOKEN        - npm token for private registries
#   NPM_REGISTRY     - Custom npm registry URL
#

set -euo pipefail

cd "$(dirname "$0")/../../.."

# Get plugins from argument or environment
PLUGINS="${1:-${SKAFF_PLUGINS:-}}"

echo "=============================================="
echo "Skaff Web Docker Build"
echo "=============================================="

if [ -n "$PLUGINS" ]; then
    echo "Plugins: $PLUGINS"
else
    echo "Plugins: (none)"
fi

echo "=============================================="

# Build with optional arguments
BUILD_ARGS=""

if [ -n "$PLUGINS" ]; then
    BUILD_ARGS="$BUILD_ARGS --build-arg SKAFF_PLUGINS=$PLUGINS"
fi

if [ -n "${NPM_TOKEN:-}" ]; then
    BUILD_ARGS="$BUILD_ARGS --build-arg NPM_TOKEN=$NPM_TOKEN"
fi

if [ -n "${NPM_REGISTRY:-}" ]; then
    BUILD_ARGS="$BUILD_ARGS --build-arg NPM_REGISTRY=$NPM_REGISTRY"
fi

# shellcheck disable=SC2086
docker build \
    $BUILD_ARGS \
    -t timonteutelink/skaff:latest \
    -f apps/web/docker/Dockerfile \
    .

echo ""
echo "=============================================="
echo "Build complete!"
echo "=============================================="
echo ""
echo "Run with:"
echo "  docker run -p 3000:3000 timonteutelink/skaff:latest"
echo ""
if [ -n "$PLUGINS" ]; then
    echo "Installed plugins: $PLUGINS"
fi
