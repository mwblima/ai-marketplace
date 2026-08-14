#!/usr/bin/env bash
# PostToolUse hook: format a file the assistant just wrote, using the formatter the
# repository already declares.
#
# Three properties this hook is written to have, because the policy review checks for them
# (.github/policy/prompt.md, Part 2):
#
#   1. Gated. It does nothing unless the project declares a formatter it already uses.
#   2. Local. No network call, no telemetry, no reading outside the edited file's project.
#   3. Silent on failure. A formatter problem must never block the user's edit, so every
#      exit is 0 and diagnostics go to stderr.
set -uo pipefail

payload="$(cat)"

# The hook contract passes a JSON event on stdin. Only the edited path is needed, and it is
# extracted without a JSON dependency so the hook has none.
file="$(printf '%s' "$payload" | sed -n 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
[ -n "$file" ] && [ -f "$file" ] || exit 0

# Walk up from the edited file to find the project root and the formatter it declares.
dir="$(cd "$(dirname "$file")" && pwd)"
while [ "$dir" != "/" ]; do
  if [ -f "$dir/.prettierrc" ] || [ -f "$dir/.prettierrc.json" ]; then
    formatter=prettier
    break
  fi
  if [ -f "$dir/pyproject.toml" ] && grep -q '\[tool.ruff' "$dir/pyproject.toml" 2>/dev/null; then
    formatter=ruff
    break
  fi
  dir="$(dirname "$dir")"
done

# No declared formatter: this repository has not opted in. Do nothing.
[ -n "${formatter:-}" ] || exit 0

case "$formatter" in
  prettier)
    command -v npx >/dev/null 2>&1 || exit 0
    npx --no-install prettier --write "$file" >/dev/null 2>&1 ||
      echo "format-guard: prettier could not format $file" >&2
    ;;
  ruff)
    command -v ruff >/dev/null 2>&1 || exit 0
    ruff format "$file" >/dev/null 2>&1 ||
      echo "format-guard: ruff could not format $file" >&2
    ;;
esac

exit 0
