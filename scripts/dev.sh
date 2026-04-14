#!/usr/bin/env bash
# Dev wrapper: boots the Paperclip server + UI with PAPERCLIP_HOME pointed
# at the .paperclip/ directory inside this repo. Keeps the Zootropolis fork's
# state fully self-contained (no crosstalk with any other Paperclip install).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PAPERCLIP_HOME="${REPO_ROOT}/.paperclip"

cd "${REPO_ROOT}/paperclip-master"
exec pnpm dev "$@"
