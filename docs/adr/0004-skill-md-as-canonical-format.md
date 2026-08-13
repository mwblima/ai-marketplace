# ADR-0004 — `SKILL.md` as the canonical format, projected to Codex and Cursor

- **Status:** Accepted
- **Date:** 2026-08-12

## Context

The marketplace must serve Claude Code, Codex, and Cursor. The question was whether that
would require maintaining three versions of every artifact — which in practice means the
second and third rot.

A survey of the current formats (August 2026) shows real convergence:

| | Skills | Commands | Rules | Hooks |
|---|---|---|---|---|
| **Claude Code** | `skills/<n>/SKILL.md` | `commands/*.md` | `CLAUDE.md` | `hooks/hooks.json` |
| **Codex** | `.agents/skills/<n>/SKILL.md` (repo), `~/.agents/skills` (user), `/etc/codex/skills` (admin) | `~/.codex/prompts` *(deprecated in favor of skills)* | `AGENTS.md` | — |
| **Cursor** | `.cursor/skills/<n>/SKILL.md` | `.cursor/commands/*.md` | `.cursor/rules/*.mdc` | `.cursor/hooks.json` |

`SKILL.md` with `name` + `description` frontmatter is **identical** across all three. OpenAI
deprecated custom prompts in favor of skills, and Cursor ships a `/migrate-to-skills`
command. The skill is the format that won.

Outside skills, divergence is wide: MCP has per-tool configuration, hooks do not exist in
Codex, and rules have three different formats.

## Decision

**The Claude Code plugin is the canonical artifact.** A build projects it to the other
targets; nothing is authored twice.

**Projection is limited to skills.** `scripts/build-targets.mjs` emits exactly two things:

- `dist/codex/skills/<n>/` — 1:1 copy of `skills/` (identical format, no transformation)
- `dist/cursor/.cursor/skills/<n>/` — same

Each target ships an `install.sh` that symlinks into the right directory on the machine.
Symlink rather than copy: Codex follows symlinked skill folders, so `git pull` updates the
artifact without reinstalling.

Commands, `CLAUDE.md` rules, hooks, MCP configuration, and packs are **not** projected. Each
would need a real per-tool transformation, and that transformation is where every plausible
bug in this script lives — a rule silently losing meaning between `CLAUDE.md` and a `.mdc`
frontmatter is not something CI can detect. None of them is common enough in the catalog to
be worth that risk yet. Limiting the scope to skills reduces the script to file copying plus
an installer: it can fail loudly, but it cannot be quietly wrong.

Revisit per format, driven by the catalog: when several artifacts genuinely need commands on
Cursor, add that projection then, in its own ADR.

**Portability rule:** an artifact declares which targets it supports in `tools:`. Pure skills
declare all three. Because only skills project, declaring `codex` or `cursor` while relying on
hooks, commands, or MCP is declaring portability the artifact does not have — the projection
would succeed and ship a fraction of the artifact. CI rejects that combination (invariant I6)
rather than emitting a partial install.

The practical consequence becomes a guideline in ADR-0007: **prefer expressing logic as a
skill.** A skill runs everywhere; a hook runs in one place.

## Consequences

- Portability is nearly free for most of the catalog, because most of the catalog is skills.
- Claude Code remains the first-class target: a Cursor-only user runs `install.sh` instead of
  `/plugin install`. This asymmetry is accepted — only Claude Code has a native marketplace
  client.
- The build is nearly immune to upstream format churn, because it does not parse or rewrite
  anything — it copies `SKILL.md` verbatim. What can break is a change to the *discovery
  paths*, which is a one-line fix in the installer.
- An artifact that needs a hook is Claude-Code-only, and the catalog says so explicitly
  instead of implying portability it does not have.
- Committing a generated `dist/` allows installation by `git clone` with nothing to run.

## Alternatives considered

- **Three sources, one per tool** — rejected: duplication guarantees divergence.
- **A neutral intermediate format compiled to all three** — rejected: it invents a fourth
  format to reconcile three that already converged. Complexity with no return.
- **Support Claude Code only** — rejected: the company uses all three, and the model's value
  for the article lies precisely in not tying governance to one vendor.
