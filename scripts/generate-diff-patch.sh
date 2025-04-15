#!/usr/bin/env bash

set -e

if [ "$#" -ne 2 ]; then
    echo "Usage: $0 <base_project_dir> <changed_project_dir>"
    exit 1
fi

BASE_PROJECT=$(realpath "$1")
CHANGED_PROJECT=$(realpath "$2")

TMP_DIR=$(mktemp -d)

cleanup() {
    rm -rf "$TMP_DIR"
}

trap cleanup EXIT

# copies the new project to the base project directory and creates a diff.
# Diff can be used in a real project
cp -r "$BASE_PROJECT"/. "$TMP_DIR"
cd "$TMP_DIR"
git init -q
git config commit.gpgsign false # TEMPORARELY BECAUSE NEED TO GENERATE NEW GPG KEY
git add .
git commit -m "Base version" -q

rsync -a --delete --exclude='.git' "$CHANGED_PROJECT"/. .

git add .
git diff --staged --no-color --no-ext-diff

