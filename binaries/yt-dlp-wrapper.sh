#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="${ROOT_DIR}/binaries"

cd "${ROOT_DIR}"

export PATH="${DENO_BIN_DIR:-${HOME}/.deno/bin}:/usr/local/bin:/usr/bin:/bin:${PATH}"

YT_DLP_BINARY="${YT_DLP_REAL_BINARY:-${BIN_DIR}/yt-dlp_linux}"
YT_DLP_COOKIES="${YT_DLP_COOKIES_PATH:-${BIN_DIR}/cookies.txt}"
YT_DLP_JS_RUNTIME="${YT_DLP_JS_RUNTIME:-deno}"

exec "${YT_DLP_BINARY}" \
  --cookies "${YT_DLP_COOKIES}" \
  --js-runtimes "${YT_DLP_JS_RUNTIME}" \
  "$@"
