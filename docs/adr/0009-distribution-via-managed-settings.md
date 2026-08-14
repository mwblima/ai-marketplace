# ADR-0009 — Distribution and enforcement via managed settings

- **Status:** Accepted
- **Date:** 2026-08-12

## Context

A governed catalog nobody installs governs nothing. We needed to define how an artifact
reaches a person's machine, and how the company keeps artifacts from outside the catalog out —
which is where "internal marketplace" turns into actual governance.

Claude Code exposes this through `managed-settings.json` (a policy file, read-only to the
client), with four relevant keys:

| Key | Effect |
|---|---|
| `extraKnownMarketplaces` | Registers the marketplace automatically, with no user action |
| `strictKnownMarketplaces` | Allowlist restricting which marketplaces can be added |
| `blockedMarketplaces` | Blocklist, supporting owner wildcards (`org-x/*`) |
| `enabledPlugins` | Installs and enables plugins or packs by default |

The same keys work in a repository's `.claude/settings.json` at project scope, which gives a
second distribution axis: per repository rather than per machine.

Codex has a partial equivalent in `/etc/codex/skills` (admin scope, taking precedence over
user scope). Cursor has dashboard-managed team rules and team commands on paid plans.

## Decision

Distribution across three scopes, broadest to most specific:

1. **Company (machine)** — `managed-settings.json` distributed by MDM:
   `extraKnownMarketplaces` registers the marketplace, `strictKnownMarketplaces` restricts to
   it plus Anthropic's official marketplace, and `enabledPlugins` enables `pack-onboarding`.
   For Codex, the same MDM package drops company-scope skills into `/etc/codex/skills`.
2. **Area/team (repository)** — a versioned `.claude/settings.json` in the team's repository,
   with `enabledPlugins` pointing at the team pack. Anyone who clones and trusts the folder
   gets the right set for that context. For Codex and Cursor, `.agents/skills` and
   `.cursor/skills` in the same repository, symlinked by `install.sh` (ADR-0004).
3. **Individual** — manual installation from the site or via `/plugin`. Always permitted
   within the allowlist.

The repository ships these files ready to use under `docs/managed-settings/`, versioned and
with an application guide, as part of the reusable model.

**Enforcement posture: allowlist on, but wide.** `strictKnownMarketplaces` restricts the
*origin* (the internal marketplace plus Anthropic's official one), while installation
**within** the internal marketplace stays free. Restricting origin is the control that
matters — it is what keeps an unreviewed artifact out. Curating item by item what each person
installs would turn the platform team into a bottleneck and push everyone back to local
files, which is the exact scenario governance exists to prevent.

## Consequences

- Real onboarding: a new machine arrives with the base set already present.
- Scope 1 depends on MDM. Without MDM, scopes 2 and 3 still work; only origin enforcement is
  lost. Record this as a prerequisite for the distribution phase.
- Scope 2 is the most valuable in practice and the cheapest: no MDM needed, it is one file in
  the team's repository, and it puts the right context in front of whoever joins the project.
- Incomplete parity across tools: Claude Code has all three scopes, Codex has admin and repo,
  Cursor needs a paid plan for company scope. Document the asymmetry rather than pretending
  it does not exist.

### Note for adopters running this privately

For a private marketplace repository distributed through organization settings, org sync
reads the repository through the Claude GitHub App or a GitHub Enterprise App, and git
credentials are not involved. In CI, a private marketplace in another repository needs a PAT
or app token exported as `GH_TOKEN` followed by `gh auth setup-git`; the default workflow
token only reaches its own repository. See ADR-0002 for the source visibility rules.

## Alternatives considered

- **Manual installation only** — rejected: without automatic registration, adoption depends
  on each person remembering, and the catalog becomes a dead wiki.
- **Strict per-plugin allowlist** — rejected, see enforcement posture.
- **Container image with `CLAUDE_CODE_PLUGIN_SEED_DIR`** — not rejected, deferred. It is the
  right answer for CI and devcontainers, and lands when that use case appears.
