#!/usr/bin/env bash
# Dev wrapper: boots the Paperclip server (on :3100) AND UI (on :5173) with
# PAPERCLIP_HOME pointed at the .paperclip/ directory inside this repo.
# Keeps the Zootropolis fork's state fully self-contained.
#
# Both processes stream to this terminal. Ctrl-C kills both.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PAPERCLIP_HOME="${REPO_ROOT}/.paperclip"

# Load zootropolis.config.json → ZOOTROPOLIS_* env vars. Existing shell env
# wins over the file, so `FOO=bar ./scripts/dev.sh` and one-off overrides
# still work. Schema at scripts/zootropolis-config.schema.json.
if [ -f "${REPO_ROOT}/zootropolis.config.json" ]; then
  CONFIG_EXPORTS="$(node "${REPO_ROOT}/scripts/zootropolis-env.mjs")"
  if [ -n "${CONFIG_EXPORTS}" ]; then
    eval "${CONFIG_EXPORTS}"
  fi
fi

# Sync the repo's Paperclip skill to the home install so claude_local
# container agents always see the latest version. Without this, the
# home-installed skill goes stale and containers read outdated rules.
SKILL_SRC="${REPO_ROOT}/paperclip-master/skills/paperclip/SKILL.md"
SKILL_DST="${HOME}/.claude/skills/paperclip/SKILL.md"
if [ -f "${SKILL_SRC}" ]; then
  mkdir -p "$(dirname "${SKILL_DST}")"
  cp "${SKILL_SRC}" "${SKILL_DST}"
fi

cd "${REPO_ROOT}/paperclip-master"

# Start the server (API + DB) in the background; UI in the foreground so
# Ctrl-C stops the foreground process and the trap kills the server.
pnpm dev:server "$@" &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true' EXIT INT TERM

# Give the server a beat to bind its port before Vite tries to proxy.
sleep 1

exec pnpm dev:ui
