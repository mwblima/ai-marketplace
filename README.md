# AI Marketplace — a governance model for shared AI artifacts

A reference implementation for versioning, governing, and sharing **AI artifacts** — skills,
agents, MCP servers, hooks, and commands — across a company, using one catalog that works
with Claude Code, Codex, and Cursor.

It is built on the marketplace format Claude Code reads natively, so nothing here requires a
custom client, installer, or backend. The whole thing is a catalog, two build scripts, a
validator, and a static page.

> This repository is a **public reference model** with fictional example artifacts. A company
> adopting it will run it **private**. Every place that changes says so — see
> [Adopting it](#adopting-it).

## Credit and origin

This project is built on, and directly inspired by, Anthropic's official plugin marketplace:
**[anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official)**.

That repository is where the pattern comes from: the `marketplace.json` catalog format, the
fixed plugin anatomy, immutable name slugs with a `renames` migration map, SHA-pinned external
sources, and — the part most worth stealing — expressing the security review as a versioned
**prompt plus a JSON output schema** rather than as reviewer folklore. Read it first; it is
the canonical reference, and this model does not replace it.

What it is not, and does not try to be, is a template for a company. It is a curated public
directory maintained by one team, so it optimizes for curating hundreds of third-party
plugins rather than for many internal teams publishing alongside each other. This repository
takes the same pattern and closes that distance.

### What this adds

| | `claude-plugins-official` | This model |
|---|---|---|
| **Catalog** | One `marketplace.json`, 3,994 lines, hand-edited | One YAML per artifact; the JSON is generated. Concurrent PRs from different teams do not conflict, and `CODEOWNERS` routes review by directory ([ADR-0003](docs/adr/0003-single-marketplace-modular-catalog.md)) |
| **Org structure** | Flat, one owner | Company / area / team scopes, where the directory path *is* the ownership model |
| **Source of truth** | Description written in the manifest, the skill, and the catalog | Written once in the catalog; manifests and `SKILL.md` frontmatter are generated ([ADR-0011](docs/adr/0011-catalog-is-the-only-definition-point.md)) |
| **Tools** | Claude Code | Claude Code, plus Codex and Cursor via skill projection ([ADR-0004](docs/adr/0004-skill-md-as-canonical-format.md)) |
| **Discovery** | Inside the CLI only | A static, searchable catalog page you can link to from a wiki or onboarding doc ([ADR-0006](docs/adr/0006-static-client-side-search.md), [ADR-0008](docs/adr/0008-static-site-on-github-pages.md)) |
| **Team bundles** | — | `pack-*` meta-plugins, so one install gives a new joiner the right set ([ADR-0005](docs/adr/0005-packs-via-native-dependencies.md)) |
| **Quality rules** | Schema and SHA-pin validation | Those plus ownership, description quality, atomicity, tool/content coherence, dependency-graph soundness, MCP host allowlist, and release-tag enforcement |
| **Rollout** | — | Ready-to-apply managed settings for machine, repository, and individual scope ([ADR-0009](docs/adr/0009-distribution-via-managed-settings.md)) |
| **Rationale** | In code review and commit history | 11 ADRs with the rejected alternatives, so an adopting company can disagree deliberately |

### What this deliberately drops

The official repo runs a nightly pipeline that refreshes third-party SHAs and automatically
reverts entries that fail the policy scan, plus a policy scan wired to Anthropic's own
federated identity. Both are excellent and both assume dozens of third-party sources. An
internal catalog has none, so carrying that machinery would be cost without benefit. The
policy is written and applied by a human, with [three documented automation
paths](.github/policy/README.md) for when it is worth it.

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

Register the marketplace once, then install what you need:

```bash
claude plugin marketplace add your-org/ai-marketplace
```

```bash
claude plugin install pack-onboarding@acme
```

`acme` is the marketplace name from `marketplace.config.json`, not the repository name —
it is what appears after the `@` in every install command.

Browsing and installing interactively works too: run `/plugin` inside Claude Code and go to
**Discover**.

**A pack installs everything in it.** A pack is a plugin manifest containing nothing but a
`dependencies` array, so this is native client behavior with no custom installer (ADR-0005):

```
✔ Successfully installed plugin: pack-backend@acme (+ 2 dependencies: deploy-kit, code-review)
```

Artifacts inside a pack remain individually installable — `claude plugin install
deploy-kit@acme` works on its own, and installing the pack afterwards does not duplicate it.
Disabling an artifact that a pack still needs is refused, with the correct chained command
in the error.

Other useful commands:

```bash
claude plugin marketplace list      # which marketplaces are registered
claude plugin marketplace update    # refresh the catalog after new artifacts are published
claude plugin list                  # what is installed, and any load errors
claude plugin uninstall pack-backend@acme --prune   # remove it and its orphaned dependencies
```

#### Trying it before publishing

Any local git repository works as a marketplace source, which is the fastest way to test a
change end to end:

```bash
claude plugin marketplace add /absolute/path/to/ai-marketplace
```

The directory must be a git repository with the changes committed — the client reads the
committed tree, not the working directory.

### Codex and Cursor

`SKILL.md` is byte-identical across all three tools, so skills are copied rather than
translated (ADR-0004). There is no marketplace client outside Claude Code, so installation is
a clone plus a symlink:

```bash
git clone https://github.com/your-org/ai-marketplace
cd ai-marketplace
```

```bash
./dist/codex/install.sh      # links into ~/.agents/skills
```

```bash
./dist/cursor/install.sh     # links into ~/.cursor/skills
```

Pass a different destination as the first argument — for example `/etc/codex/skills` for the
admin scope, or a repository's `.agents/skills` to scope the artifacts to one project.

Symlinks, not copies, so `git pull` updates every installed skill in place with no second
step. Only skills project — packs, hooks, commands, and MCP configuration do not. Full
detail and per-tool discovery paths: [docs/adoption/other-tools.md](docs/adoption/other-tools.md).

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
   behavior. Performed by a human against the PR checklist.
   [`.github/policy/README.md`](.github/policy/README.md) gives three automation paths —
   reviewer assist, advisory CI, blocking check — with the failure modes to design for
   before each one. Writing the policy before automating it is the intended order: a policy
   you have applied by hand a dozen times is one you can trust a model to apply.

Distribution and enforcement — automatic marketplace registration, default-enabled packs,
and restricting which marketplaces can be added at all — are covered in
[ADR-0009](docs/adr/0009-distribution-via-managed-settings.md) with ready-to-apply files
under [`docs/managed-settings/`](docs/managed-settings/).

## Adopting it

Fork it, strip the examples, publish one artifact a team already wanted. About an afternoon.

**→ [docs/adoption/README.md](docs/adoption/README.md)** walks through it, including the two
decisions that are expensive to reverse (the marketplace name, and repository visibility)
and which parts of the model are meant to be changed per company.

The example artifacts are fictional but written as real ones, so you can see what a good
`SKILL.md` looks like before deleting them.

## Design decisions

Every structural decision is recorded, with the alternatives that were rejected and why:
**[docs/adr/](docs/adr/README.md)**.

Start with [ADR-0002](docs/adr/0002-adopt-anthropic-marketplace-format.md) (why this format)
and [ADR-0003](docs/adr/0003-single-marketplace-modular-catalog.md) (how modularity works).

## License

MIT.

The pattern this implements originates in
[anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official).
No code is copied from it; what is reused is the catalog format, the plugin anatomy, and the
idea of a security policy as a versioned prompt with a structured verdict. See
[ADR-0002](docs/adr/0002-adopt-anthropic-marketplace-format.md) for exactly what was inherited
and what was dropped.
