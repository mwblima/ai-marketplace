# Architecture Decision Records

Decision log for the corporate AI Artifacts marketplace.

## Format

Each ADR uses a reduced MADR: **Context → Decision → Consequences → Alternatives considered**.

An accepted ADR is never edited. To change a decision, write a new ADR that supersedes it
and mark the old one `Superseded by ADR-XXXX`.

## Status values

| Status | Meaning |
|---|---|
| `Proposed` | Written, awaiting validation. Subject to change. |
| `Accepted` | Decided. Implementation may proceed. |
| `Superseded` | Revoked by a later ADR. |

## Index

| ADR | Title | Status |
|---|---|---|
| [0001](0001-record-decisions-in-adrs.md) | Record decisions in ADRs | Accepted |
| [0002](0002-adopt-anthropic-marketplace-format.md) | Adopt the Anthropic `marketplace.json` format as the base | Accepted |
| [0003](0003-single-marketplace-modular-catalog.md) | Single marketplace, modular catalog, multi-marketplace as an exit | Accepted |
| [0004](0004-skill-md-as-canonical-format.md) | `SKILL.md` as the canonical format, projected to Codex and Cursor | Accepted |
| [0005](0005-packs-via-native-dependencies.md) | Plugin packs via native `dependencies` | Accepted |
| [0006](0006-static-client-side-search.md) | Name and description search via a static client-side index | Accepted |
| [0007](0007-guardrails-and-atomicity.md) | Quality guardrails and artifact atomicity | Accepted |
| [0008](0008-static-site-on-github-pages.md) | Static site on GitHub Pages, no framework | Accepted |
| [0009](0009-distribution-via-managed-settings.md) | Distribution and enforcement via managed settings | Accepted |
| [0010](0010-versioning-and-releases.md) | Versioning, release tags, and SHA pinning | Accepted |
| [0011](0011-catalog-is-the-only-definition-point.md) | The catalog entry is the only place an artifact is defined | Accepted |
| [0012](0012-declared-surfaces-and-reattestation.md) | Declared surfaces and periodic reattestation | Accepted |

## Note for adopters

This repository is a **public reference model**. A company adopting it will almost
certainly run it as a **private** repository, since the catalog exposes internal team
names, tooling, and workflows. Every ADR that is affected by that difference says so
explicitly — see ADR-0002 (plugin source rules), ADR-0008 (GitHub Pages hosting), and
ADR-0009 (distribution).
