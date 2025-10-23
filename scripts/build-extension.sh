#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
IMAGE_NAME="zapelm-build:latest"
HOST_UID="$(id -u)"
HOST_GID="$(id -g)"

echo "Building devcontainer image (${IMAGE_NAME})..."
docker build \
  --file "${PROJECT_ROOT}/.devcontainer/Dockerfile" \
  --build-arg NODE_UID="${HOST_UID}" \
  --build-arg NODE_GID="${HOST_GID}" \
  --tag "${IMAGE_NAME}" \
  "${PROJECT_ROOT}"

echo "Running build inside container..."
docker run --rm \
  --user node \
  -v "${PROJECT_ROOT}:/workspaces/app" \
  -w /workspaces/app \
  "${IMAGE_NAME}" \
  bash -lc "set -euo pipefail
if ! command -v zip >/dev/null 2>&1; then
  echo 'zip コマンドが見つかりません。コンテナイメージに zip パッケージを追加してください。' >&2
  exit 1
fi
npm ci
npm run build
mkdir -p artifacts
rm -f artifacts/zapelm-extension.zip
zip -r artifacts/zapelm-extension.zip manifest.json dist
"

echo "Build complete. Output archive: artifacts/zapelm-extension.zip"
