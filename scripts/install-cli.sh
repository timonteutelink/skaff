#!/usr/bin/env bash
set -euo pipefail

OWNER="timonteutelink"
REPO="code-templator"
CLI="code-templator"

usage() {
  cat <<EOF
Usage: $0 [version]
Installs to your home directory

Examples:
  $0          # install latest
  $0 v1.2.3   # install specific tag
EOF
  exit 1
}
[[ "${1:-}" =~ ^(-h|--help)$ ]] && usage
VERSION="${1:-latest}"

# deps
for cmd in curl tar; do
  if ! command -v $cmd &>/dev/null; then
    echo "Error: '$cmd' is required." >&2
    exit 1
  fi
done

# OS/ARCH detection
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
[[ $OS == linux||$OS == darwin ]] || { 
  echo "Unsupported OS: $OS" >&2; exit 1; 
}
MACHINE=$(uname -m)
case "$MACHINE" in
  x86_64)   ARCH="x64"  ;;
  aarch64|arm64) ARCH="arm64" ;;
  *) echo "Unsupported arch: $MACHINE" >&2; exit 1;;
esac

# temp dir
TMP=$(mktemp -d)
trap "rm -rf $TMP" EXIT

# resolve tag
if [[ "$VERSION" == latest ]]; then
  TAG=$(curl -sS https://api.github.com/repos/$OWNER/$REPO/releases/latest \
       | grep -Po '"tag_name":\s*"\K(.*)(?=")')
  [[ -n $TAG ]] || { echo "Could not fetch latest tag." >&2; exit 1; }
else
  TAG="$VERSION"
fi
echo "Installing $CLI $TAG → user directory"

# download & extract
FILE="$CLI-$TAG-$OS-$ARCH.tgz"
URL="https://github.com/$OWNER/$REPO/releases/download/$TAG/$FILE"
curl -fSL --retry 3 "$URL" -o "$TMP/$FILE" \
  || { echo "Download failed." >&2; exit 1; }
tar -xzf "$TMP/$FILE" -C "$TMP"

# make sure we got the binary
EXE="$TMP/$CLI"
[[ -x $EXE ]] || { echo "Binary not found in archive." >&2; exit 1; }

# install dir
DEST="${XDG_BIN_HOME:-$HOME/.local/bin}"
mkdir -p "$DEST"
mv "$EXE" "$DEST/$CLI"
chmod +x "$DEST/$CLI"

echo "✅ Installed to $DEST/$CLI"
if ! echo $PATH | tr ':' '\n' | grep -qx "$DEST"; then
  cat <<EOF

⚠️  Add to your PATH:

  export PATH="\$PATH:$DEST"

You can put that line in your ~/.bashrc, ~/.zshrc, or ~/.profile.
EOF
fi

