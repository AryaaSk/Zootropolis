#!/usr/bin/env bash
# Dev wrapper: boots the Paperclip server (on :3100) AND UI (on :5173) with
# PAPERCLIP_HOME pointed at the .paperclip/ directory inside this repo.
# Keeps the Zootropolis fork's state fully self-contained.
#
# Both processes stream to this terminal. Ctrl-C kills both.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PAPERCLIP_HOME="${REPO_ROOT}/.paperclip"
# Zootropolis: strict parent↔child issue delegation + agent visibility scoping.
# See design.md §3 + §4. Set to false (or unset) to fall back to vanilla
# Paperclip semantics.
export ZOOTROPOLIS_DELEGATION_STRICT=true

cd "${REPO_ROOT}/paperclip-master"

# Start the server (API + DB) in the background; UI in the foreground so
# Ctrl-C stops the foreground process and the trap kills the server.
pnpm dev:server "$@" &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true' EXIT INT TERM

# Give the server a beat to bind its port before Vite tries to proxy.
sleep 1

exec pnpm dev:ui
