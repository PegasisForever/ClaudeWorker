#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$ROOT_DIR/monitor"
bun run build

cd "$ROOT_DIR"
docker build -t pegasis0/claude-worker:latest .