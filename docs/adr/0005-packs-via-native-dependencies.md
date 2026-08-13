# ADR-0005 — Plugin packs via native `dependencies`

- **Status:** Accepted
- **Date:** 2026-08-12

## Context

Requirement: define a pack — for example, a team's five plugins — that installs everything
together in one action. The question was whether this would require building a custom
installer.

**It does not. It is native.** The
[plugin dependencies documentation](https://code.claude.com/docs/en/plugin-dependencies)
specifies that a plugin manifest may consist of **only** `name`, `version`, and a
`dependencies` array, and that installing such a plugin resolves and installs all of its
dependencies. "Bundle plugins for a team" is a documented use case, not a side effect.

Relevant behaviors verified in the spec:

- Enabling a plugin enables its dependencies at the same scope, recursively.
- Disabling a dependency still required by another enabled plugin is **blocked**, with an
  error that hands back the correctly ordered chained command.
- `dependencies` accepts a bare string (`"audit-logger"`) or an object with a semver range
  (`{ "name": "secrets-vault", "version": "~2.1.0" }`).
- Ranges from multiple plugins on the same dependency are **intersected**; a conflict fails
  with `range-conflict` and leaves the environment unchanged rather than half-installed.
- Cross-marketplace dependencies are blocked by default, allowed only via
  `allowCrossMarketplaceDependenciesOn` on the root marketplace.
- `claude plugin prune` removes auto-installed dependencies that became orphaned.

## Decision

Packs are **meta-plugins**: a directory containing only `.claude-plugin/plugin.json` with
`name`, `version`, `description`, and `dependencies`. No skills, no commands, no code.

- Source of truth: `catalog/packs/<name>.yaml`. The pack's `plugin.json` is emitted by the
  same build that generates `marketplace.json` (ADR-0003).
- Naming convention: a `pack-` prefix (`pack-backend`, `pack-data`, `pack-onboarding`).
  Unlike regular plugins, the prefix is justified here: a pack is a category of object
  rather than an artifact, and users need to tell the two apart in a list.
- A pack may only depend on artifacts **within this marketplace** in v1.
  `allowCrossMarketplaceDependenciesOn` stays empty until a second marketplace exists.
- Packs are the natural onboarding vehicle: `pack-onboarding` goes into `enabledPlugins` in
  managed settings (ADR-0009), so everyone in the company receives the base set.
- Team packs reference artifacts by name, **without** version constraints by default. Add a
  constraint (`~2.1.0`) only where there is real, tested coupling — otherwise the pack
  becomes a hand-maintained lockfile that nobody updates.

Recorded constraint: adding an artifact to a pack requires **publishing a new pack version**.
Auto-update is off by default for non-Anthropic marketplaces, so people who already have the
pack only receive the new artifact after enabling auto-update for the marketplace or running
`claude plugin update pack-backend` followed by `/reload-plugins`. This must live in the
platform team's runbook, otherwise the expectation "I added it to the pack, so everyone has
it" silently fails.

## Consequences

- The requirement is met with zero installer code.
- Recursive resolution, protection against disabling an in-use dependency, and orphan
  cleanup all come along with it.
- Packs work in Claude Code only. Codex and Cursor have no dependency resolution; for them
  the pack's `install.sh` (ADR-0004) symlinks the corresponding set of skills.
- The dependency graph must be validated in CI: cycles, dependencies on nonexistent
  artifacts, and dependencies on `deprecated` artifacts all fail the PR (ADR-0007).

## Alternatives considered

- **A custom `pack:` field plus a batch install script** — rejected: it badly reimplements
  what the client already does well, and loses the enable/disable guarantees.
- **One marketplace per pack** — rejected: a marketplace is a unit of trust and
  distribution, not of grouping; users would have to register one per team.
- **A pack as a real plugin that re-exports the other skills** — rejected: duplicates content
  and creates two sources of truth for the same skill.
