# ADR-0002 — Adopt the Anthropic `marketplace.json` format as the base

- **Status:** Accepted
- **Date:** 2026-08-12

## Context

The goal is a corporate marketplace that versions and shares AI Artifacts (skills, agents,
MCP servers, hooks, commands). There were two routes: invent a catalog format, or adopt the
format Claude Code already reads natively.

Analysis of `anthropics/claude-plugins-official` showed a mature and small pattern: one
`marketplace.json` with 287 entries, plugins with a fixed anatomy
(`.claude-plugin/plugin.json` plus `commands/`, `agents/`, `skills/`, `.mcp.json`), and a
governance layer living entirely in `.github/` (9 workflows, security policy expressed as a
prompt plus a JSON output schema).

The deciding factor: the client already knows how to install from this format. A custom
format would mean building an installer, a cache, version resolution, and update logic —
months of work reimplementing what already exists.

## Decision

Adopt `.claude-plugin/marketplace.json` as the distribution format, staying fully
compatible with the official client. This repository is a conceptual fork of the pattern,
not a git fork of Anthropic's plugin list.

Deliberately inherited from the official pattern:

| Element | Rationale |
|---|---|
| `name` as an immutable slug plus a `renames` map | Renaming breaks installs for everyone who already has the plugin. The map migrates them transparently. |
| SHA-pinned `source` for external sources | A `ref: main` lets content change under users without review. |
| Fixed plugin anatomy | Enables automated validation and makes any plugin readable without documentation. |
| Security policy as a prompt plus a JSON output schema | Review becomes a versioned, auditable artifact instead of tacit reviewer knowledge. |

Dropped from the official pattern:

- The nightly SHA bump plus auto-revert pipeline — it only pays off with dozens of
  third-party sources (see ADR-0010).
- The `external_plugins/` directory — v1 carries internal artifacts only.

**Company-wide artifacts live in this repository.** They are referenced by relative path
(`"source": "./plugins/<name>"`), which is the same mechanism the official marketplace uses
for its own 53 first-party plugins. This keeps the common case to a single PR in a single
repo: add the artifact directory, add its catalog entry, done.

## Consequences

- Zero client work: `/plugin marketplace add` and `/plugin install` work on day one.
- We are coupled to the evolution of Anthropic's schema. Mitigation: the internal catalog is
  the source of truth and `marketplace.json` is **generated** (ADR-0003), so a schema change
  is a change to the generator, not to N files.
- Non-trivial features come for free: dependency resolution (ADR-0005), version constraints,
  `plugin prune`, and container seeding.

### Note for adopters running this privately

This reference repository is public; an adopting company will run it private. That changes
the plugin source rules. When a marketplace is distributed through organization settings on
a Team or Enterprise plan, the marketplace repository must be private or internal, and
organization sync reads it through the Claude GitHub App or a GitHub Enterprise App. A
plugin source may be private only when it is a github.com source under the same owner as
the marketplace repository, or a source on the organization's GHE host with the app
installed. Every other source is fetched without credentials and must be public. Keeping
company artifacts inside the marketplace repository, as decided above, sidesteps this
entirely — which is a second reason for that choice.

## Alternatives considered

- **Proprietary format plus a custom CLI** — rejected. Very high cost and no gain: the
  Anthropic format is plain JSON, so there is no meaningful lock-in to avoid.
- **Git fork of the official repo keeping all 287 entries** — rejected. Nobody wants to
  inherit Anthropic's third-party curation; we want the pattern, not the content.
