#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT_DIR/rust-core"

if ! command -v wasm-pack >/dev/null 2>&1; then
  echo "[dev-wasm] wasm-pack 未安装，请运行：curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh" >&2
  exit 1
fi

VERSION_STR=$(wasm-pack --version | awk '{print $2}')
MIN_VERSION="0.12.1"

version_ge() {
  local IFS=.
  local i
  local ver1=($1)
  local ver2=($2)
  local len=${#ver2[@]}
  for ((i = 0; i < len; i++)); do
    local v1=${ver1[i]:-0}
    local v2=${ver2[i]:-0}
    if ((v1 > v2)); then
      return 0
    elif ((v1 < v2)); then
      return 1
    fi
  done
  return 0
}

if version_ge "$VERSION_STR" "$MIN_VERSION" && wasm-pack build --help | grep -q -- "--watch"; then
  echo "[dev-wasm] 使用 wasm-pack --watch (版本 $VERSION_STR)"
  exec wasm-pack build --dev --target web --out-dir pkg --watch
fi

echo "[dev-wasm] 当前 wasm-pack 版本 ($VERSION_STR) 不支持 --watch。"
if command -v cargo watch >/dev/null 2>&1; then
  echo "[dev-wasm] 回退到 cargo watch，确保已安装：cargo install cargo-watch"
  exec cargo watch -q -w src -w Cargo.toml -s "wasm-pack build --dev --target web --out-dir pkg"
fi

echo "[dev-wasm] 未找到 cargo watch。请执行：cargo install cargo-watch 或升级 wasm-pack 至 >= $MIN_VERSION。" >&2
exit 1
