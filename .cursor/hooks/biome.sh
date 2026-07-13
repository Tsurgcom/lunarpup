#!/usr/bin/env bash
set -euo pipefail

export PATH="$HOME/.bun/bin:$PATH"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
input=$(cat)

file_path=$(printf '%s' "$input" | bun -e '
const d = JSON.parse(require("fs").readFileSync(0, "utf8"));
console.log(d.file_path ?? "");
')

if [[ -z "$file_path" ]]; then
  exit 0
fi

if [[ "$file_path" != /* ]]; then
  file_path="$ROOT/$file_path"
fi

case "$file_path" in
  */v1/*|*/v2/*|*/.agents/*) exit 0 ;;
esac

case "$file_path" in
  *.ts|*.tsx|*.js|*.jsx|*.json|*.css) ;;
  *) exit 0 ;;
esac

cd "$ROOT"
bunx biome check --write --no-errors-on-unmatched "$file_path" 2>/dev/null || true
exit 0
