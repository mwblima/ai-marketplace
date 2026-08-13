# AI Marketplace — a governance model for shared AI artifacts

A reference implementation for versioning, governing, and sharing **AI artifacts** — skills,
agents, MCP servers, hooks, and commands — across a company, using one catalog that works
with Claude Code, Codex, and Cursor.

It is built on the marketplace format Claude Code reads natively, so nothing here requires a
custom client, installer, or backend. The whole thing is a catalog, two build scripts, a
validator, and a static page.

> This repository is a **public reference model** with fictional example artifacts. A company
> adopting it will run it **private**. Every place that changes says so — see
> [Adopting this privately](#adopting-this-privately).

## Why

Teams accumulate prompts, skills, and agent configs in local files and chat messages. They
get copied, drift, and nobody can tell which version is current or whether the one they found
is safe to run. The fix is not a wiki page — it is the same thing that fixed shared code:
a catalog with owners, versions, review, and a way to find things.

## How it works

```
catalog/                    ← the only thing authors edit
  company/                    company-wide artifacts     (owner: platform)
  engineering/backend/        team artifacts             (owner: backend)
  engineering/data/           team artifacts             (owner: data)
  packs/                      curated sets               (ADR-0005)

plugins/                    ← artifact content: SKILL.md, commands, MCP config

.claude-plugin/marketplace.json   ← GENERATED, consumed by the Claude Code client
docs/data/index.json              ← GENERATED, powers the site search
dist/{codex,cursor}/              ← GENERATED, projections for the other tools
```

The catalog is the single source of truth. Everything else is generated, and CI fails if a
generated file is out of sync — so the JSON can never be hand-edited into divergence.

| Command | What it does |
|---|---|
| `npm run build` | Regenerates `marketplace.json`, pack manifests, and the site index |
| `npm run validate` | Runs the guardrails (invariants I1–I9 from ADR-0007) |
| `npm run ci` | Both, the way CI runs them |
| `node scripts/build-targets.mjs` | Projects skills onto Codex and Cursor |

## Using it

### Claude Code

```bash
claude plugin marketplace add your-org/ai-marketplace
claude plugin install pack-onboarding@acme
```

A pack is a plugin manifest containing nothing but a `dependencies` array. Installing it
resolves and installs everything in it — native behavior, no custom installer (ADR-0005).

### Codex and Cursor

`SKILL.md` is byte-identical across all three tools, so skills are copied rather than
translated (ADR-0004):

```bash
git clone https://github.com/your-org/ai-marketplace
./ai-marketplace/dist/codex/install.sh     # symlinks into ~/.agents/skills
./ai-marketplace/dist/cursor/install.sh    # symlinks into ~/.cursor/skills
```

Symlinks, not copies — `git pull` then updates every artifact in place.

## Publishing an artifact

You write **two things**, and the build produces the rest (ADR-0011):

1. `catalog/<area>/<team>/<name>.yaml` — one file per artifact. The path determines the
   owner and routes review through `CODEOWNERS`. This is where the name, version, and
   description live, once.
2. `plugins/<name>/skills/<name>/SKILL.md` — the **body** only. The build writes the
   frontmatter from the catalog entry, so the description that drives search, the install
   UI, and model activation is the same string by construction.

Then:

```bash
npm run ci     # regenerates everything and runs the guardrails
```

Open a PR (the template carries the policy checklist). After merge, tag the release with
`claude plugin tag --push` (ADR-0010).

Never edit `.claude-plugin/marketplace.json`, `plugins/*/.claude-plugin/plugin.json`, or a
`SKILL.md` frontmatter block by hand — the next build overwrites them, and CI fails the PR
before that can surprise anyone.

## Governance

Three layers, cheapest first (ADR-0007):

1. **Schema** — required fields and enums on every catalog entry.
2. **CI invariants** — immutable names, pinned SHAs, valid skill frontmatter, usable
   descriptions, tool/content coherence, a sound dependency graph, real owners, allowlisted
   MCP hosts. Seconds, blocking.
3. **Policy review** — [`.github/policy/prompt.md`](.github/policy/prompt.md) with a
   structured verdict in [`schema.json`](.github/policy/schema.json), covering what a script
   cannot judge: hook scope, undisclosed telemetry, whether the description matches actual
   behavior. Performed by a human in v1; the prompt is written so it can be automated later
   without being rewritten.

Distribution and enforcement — automatic marketplace registration, default-enabled packs,
and restricting which marketplaces can be added at all — are covered in
[ADR-0009](docs/adr/0009-distribution-via-managed-settings.md) with ready-to-apply files
under [`docs/managed-settings/`](docs/managed-settings/).

## Adopting this privately

Running this inside a company changes three things. Read these before rollout:

| Concern | Where |
|---|---|
| Private repos change which **plugin sources** are reachable | [ADR-0002](docs/adr/0002-adopt-anthropic-marketplace-format.md) |
| GitHub Pages with private visibility needs Enterprise Cloud — and publishing a public site from a private repo leaks the catalog | [ADR-0008](docs/adr/0008-static-site-on-github-pages.md) |
| MDM distribution, and what still works without MDM | [ADR-0009](docs/adr/0009-distribution-via-managed-settings.md) |

Then: replace `marketplace.config.json`, delete the example artifacts under `catalog/` and
`plugins/`, and rewrite `.github/CODEOWNERS` for your org.

## Design decisions

Every structural decision is recorded, with the alternatives that were rejected and why:
**[docs/adr/](docs/adr/README.md)**.

Start with [ADR-0002](docs/adr/0002-adopt-anthropic-marketplace-format.md) (why this format)
and [ADR-0003](docs/adr/0003-single-marketplace-modular-catalog.md) (how modularity works).

## License

MIT.
