# ADR-0003 — Single marketplace, modular catalog, multi-marketplace as an exit

- **Status:** Accepted
- **Date:** 2026-08-12

## Context

The marketplace must be modular enough to organize artifacts at three levels: **company**
(what everyone uses), **area** (engineering, data, product), and **team** (a specific squad).
It must stay simple to adopt at the same time.

The official Anthropic repository keeps a single `marketplace.json` of 3,994 lines. That
works for a catalog curated by one team, but it breaks when N teams open PRs concurrently:
every PR touches the same file, merge conflicts become routine, and `CODEOWNERS` cannot
route review because the path is always the same.

There was also the option of one marketplace per area (N repositories), since Claude Code
supports multiple registered marketplaces and cross-marketplace dependencies via
`allowCrossMarketplaceDependenciesOn`.

On catalog size, the documentation states no cap on entries per marketplace. The real
constraints are different in kind and worth recording precisely:

- **Repository fetch time.** Claude Code applies a 120-second timeout to all git
  operations, including cloning plugin repositories and pulling marketplace updates. It is
  tunable via `CLAUDE_CODE_PLUGIN_GIT_TIMEOUT_MS`, and `--sparse` limits checkout to
  specific directories for monorepos. This scales with repository *bytes*, not entry count.
- **Per-session cost.** Many enabled plugins mean many skills and MCP tools loaded into
  context. This is bounded by what each user has **enabled**, not by what the catalog
  **contains** — so it is addressed by packs and scoped enablement (ADR-0005, ADR-0009),
  not by splitting the catalog.

So splitting into multiple marketplaces is the right answer to repository growth and to
independent release cadence or access control per area, not to a hard entry limit.

## Decision

**One repository, one marketplace, catalog partitioned by directory.**

```
catalog/
  company/                    # cross-cutting artifacts, owned by platform
    code-review.yaml
  engineering/
    backend/                  # area/team
      deploy-kit.yaml
    data/
      dbt-helper.yaml
  packs/
    pack-backend.yaml         # see ADR-0005
plugins/                      # artifact content, referenced by relative path
  code-review/
  deploy-kit/
```

- Each artifact is **one YAML file** at `catalog/<area>/<team>/<name>.yaml`. It is the only
  file an author edits by hand when publishing.
- `.claude-plugin/marketplace.json` is **generated** by `scripts/build-marketplace.mjs` and
  committed (the client needs it in the repo). CI fails if the generated file is out of sync.
- The path under `catalog/` defines ownership. `CODEOWNERS` maps directory to reviewing team.
- Governance metadata the official schema does not have lives as catalog-only fields and is
  stripped when generating `marketplace.json`: `owner_team`, `scope`
  (`company|area|team`), `maturity` (`experimental|supported|deprecated`),
  `data_classification`, and `tools`.

**Names are globally unique with no mandatory prefix.** The `name` appears in the command a
person types (`/plugin install deploy-kit@acme`), so prefixing everything with the team
pollutes the UX and — worse — teams get renamed in reorgs while the slug is immutable
(ADR-0002). Uniqueness is enforced by CI, not by convention. Hierarchy lives in the path and
in metadata, both of which can change freely.

**Designed for the split, not split yet.** Three constraints are accepted now so that
promoting an area to its own marketplace later is a move, not a rewrite:

1. The catalog directory boundary is the future repository boundary. No artifact reads files
   from a sibling area's directory.
2. `allowCrossMarketplaceDependenciesOn` stays present but empty in `marketplace.json`, so
   the field is already in the generator when the second marketplace appears.
3. The build script takes the catalog root as a parameter and emits one marketplace per root,
   so producing N marketplaces later is configuration, not new code.

## Consequences

- PRs from different teams do not conflict, and review routing is automatic.
- Generating-and-committing requires a CI check ("is `build-marketplace` clean?"), otherwise
  someone hand-edits the JSON and the catalog diverges.
- The hierarchy is reorganizable: moving `catalog/engineering/backend/x.yaml` to
  `catalog/company/x.yaml` changes owner and scope without breaking any install.
- Extensible to other companies: a different org structure means different directories and a
  different `CODEOWNERS`, nothing more.
- Repository size becomes the metric to watch, since it drives clone time against the
  120-second git timeout. When it becomes a problem, the answer is `--sparse` first and a
  marketplace split second.

## Alternatives considered

- **A hand-edited monolithic `marketplace.json`** (the official pattern) — rejected because
  of merge conflicts and the impossibility of routing review.
- **One marketplace per area, N repositories, now** — rejected *for v1*. It solves isolation
  but multiplies maintenance (N pipelines, N sites) and forces users to register N
  marketplaces. Kept as the documented scaling path above.
- **Namespaced names (`backend/deploy-kit`)** — rejected: the slug is immutable and teams are
  not, so we would freeze the 2026 org chart inside the identifier.
