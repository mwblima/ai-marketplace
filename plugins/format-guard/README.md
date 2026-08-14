# Format Guard

Runs the repository's own formatter after the assistant edits a file.

## What it does

- A `PostToolUse` hook matching `Edit|Write` calls `hooks/format.sh` with the edited path.
- The script is **gated**: it walks up to the project root and does nothing unless the
  repository already declares a formatter (`.prettierrc`, or `[tool.ruff]` in
  `pyproject.toml`). A repository that has not opted in sees no behavior change.
- `/format` formats the files currently changed in the working tree, on demand.

It makes no network calls, sends no telemetry, and reads nothing beyond the file that was
just edited. See [`.github/policy/example-verdict.json`](../../.github/policy/example-verdict.json)
for the completed policy review of this artifact.

## Install

```bash
claude plugin install format-guard@acme
```

Claude Code only. Hooks and commands do not project to Codex or Cursor
([ADR-0004](../../docs/adr/0004-skill-md-as-canonical-format.md)), which is why the catalog
entry declares `tools: [claude]` — invariant I6 fails the build otherwise.

## Maintainers

Owned by `@acme/platform`.
