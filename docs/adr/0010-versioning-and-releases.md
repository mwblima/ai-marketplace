# ADR-0010 — Versioning, release tags, and SHA pinning

- **Status:** Proposed
- **Date:** 2026-08-12

## Context

The marketplace is meant to be the source of versioning and sharing for AI Artifacts. That
requires answering: what is a version of an artifact, how does a consumer pin one, and what
happens when the author publishes a new one.

The client mechanism is specific and must be followed exactly, otherwise version constraints
simply do not resolve: a plugin's version is discovered through a **git tag** shaped
`{plugin-name}--v{version}`, where `{version}` matches the `version` field in `plugin.json`
at that commit. The `claude plugin tag --push` command derives the tag name from the
manifest, validates the contents, checks that `plugin.json` and the marketplace entry agree
on the version, requires a clean working tree, and refuses if the tag already exists.

For plugins referenced by relative path — our case, since artifacts live in the marketplace
repository itself (ADR-0002) — tags are read from the marketplace repository.

## Decision

1. **Semver per artifact**, in `plugin.json`'s `version`, with the usual meaning: *major*
   breaks the usage contract (a skill changes purpose, an MCP server renames a tool), *minor*
   adds, *patch* fixes wording without changing behavior.
2. **Release by tag** `{plugin-name}--v{version}`, created with `claude plugin tag --push` and
   never by hand. An untagged artifact still works (the client installs the marketplace's
   current copy) but **cannot be the target of a version constraint** — which in practice
   means: no tag, no place in a constrained pack.
3. **Monorepo with independent version lines.** The name prefix in the tag exists precisely
   for this; a PR touching two artifacts produces two tags.
4. **SHA pinning is mandatory for any external source** (I2 in ADR-0007). While the catalog is
   internal-only this rule is idle — but it must be written before the first external
   artifact, not after.
5. **No nightly bump/revert pipeline in v1.** The official pattern maintains
   `bump-plugin-shas.yml` and `revert-failed-bumps.yml` to refresh third-party SHAs nightly
   and drop policy failures from the PR. It is an excellent piece and unnecessary for an
   internal catalog with no third-party sources. Documented as an extension for adopters who
   curate external plugins.
6. **Deprecation is a state, not a deletion.** `maturity: deprecated` keeps the artifact
   installable, marks it on the site, blocks it from entering new packs (I7), and requires a
   `superseded_by` field. Removing the catalog entry breaks everyone who has it installed —
   deletion is always the last step, months later.

## Consequences

- Consumers can genuinely pin versions, with resolution handled by the client.
- The release ritual is one command, which is essential for non-platform teams to publish
  without reading documentation.
- Cost: tagging discipline. An artifact whose `version` rises without a matching tag becomes a
  silent inconsistency — CI should warn when `version` changes in a PR without a corresponding
  tag at merge.
- Writing the SHA-pin rule before needing it avoids the "just this once, it is a trusted repo"
  argument on the first concrete case.

## Alternatives considered

- **No versioning, always latest** — rejected: this is exactly the scenario in the official
  documentation where an upstream rename breaks every dependent at once.
- **Version the whole marketplace instead of the artifact** — rejected: couples independent
  team cadences and forces a company-wide release to fix a typo.
- **Plain semver tags (`v1.2.0`)** — impossible: the client filters tags by
  `{plugin-name}--v`, so a monorepo requires the prefix.
