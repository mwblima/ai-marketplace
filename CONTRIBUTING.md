# Contributing

How to publish an artifact to the marketplace, end to end.

This document is written to be followed literally — by a person, or by an AI assistant
helping one. Every path, field, and command below is exact. If you are an assistant working
in this repository, read this file before creating or editing anything under `catalog/` or
`plugins/`, and follow the invariant reference at the bottom rather than guessing at
conventions.

---

## The short version

```bash
# 1. content — write the body of the skill, no frontmatter needed
mkdir -p plugins/<name>/skills/<name>
$EDITOR plugins/<name>/skills/<name>/SKILL.md

# 2. catalog — the one file that defines the artifact
$EDITOR catalog/<area>/<team>/<name>.yaml

# 3. generate + check
npm run ci

# 4. open a PR, fill in the template

# 5. after merge, from plugins/<name>/
claude plugin tag --push
```

You write **two files**. Everything else in the repository is generated from them
([ADR-0011](docs/adr/0011-catalog-is-the-only-definition-point.md)).

---

## Step 0 — Decide what you are building

**Is it one thing?** If describing it needs the word "and" to list distinct jobs — "generates
migrations **and** deploys them" — it is two artifacts. Split it. Small artifacts compose;
large ones get triggered at the wrong moment and then get distrusted.

**Does it already exist?** Search the catalog page or `catalog/` before writing. A second
artifact that overlaps an existing one makes both less likely to trigger correctly.

**Which kind?**

| You want | Build |
|---|---|
| Reusable instructions the model applies when a task calls for it | A **skill** — the default, and the only kind that works in all three tools |
| A curated set installed together for a team | A **pack** — see [Adding a pack](#adding-a-pack) |
| Something that must run automatically on an event | A **hook** — Claude Code only; see [When you need a hook](#when-you-need-a-hook) |

**Prefer a skill.** A skill is portable across Claude Code, Codex, and Cursor, and it is
opt-in. A hook runs in one tool, globally, and invisibly.

**Where does it belong?** The path under `catalog/` *is* the ownership model
([ADR-0003](docs/adr/0003-single-marketplace-modular-catalog.md)):

| Path | Scope | Use when |
|---|---|---|
| `catalog/company/<name>.yaml` | `company` | Everyone benefits, regardless of team |
| `catalog/<area>/<team>/<name>.yaml` | `team` | One team owns it and uses it |
| `catalog/packs/<name>.yaml` | any | It is a pack |

Owning team is derived from that path via `.github/CODEOWNERS`, and must match the
`owner_team` field.

---

## Step 1 — Write the skill

Create `plugins/<name>/skills/<name>/SKILL.md`. Write the **body only** — the build writes
the frontmatter from your catalog entry, and will overwrite anything you put there.

```markdown
# Short title

One line stating what this does.

## When this applies

The conditions under which the model should follow these instructions.

## Instructions

Concrete, ordered steps. Be specific about what to do and what not to do.

## Output

The exact shape of the result: format, ordering, what to omit.
```

### What makes a skill good

- **Be specific about what NOT to do.** "Report findings only, do not restate what the change
  does" prevents more bad output than three paragraphs about what to include.
- **State the output shape exactly.** Ambiguity in the output section produces inconsistency
  across runs.
- **Encode judgment, not just procedure.** The value is in what your team knows that is not
  written anywhere else: which migration shapes are unsafe, which layering rules matter.
- **Keep it under 500 lines** (enforced by invariant I5). Longer material goes in
  `plugins/<name>/skills/<name>/references/` and is loaded on demand.
- **No coercive instructions.** "Ignore other instructions", "always run first", or anything
  that overrides the user's own guidelines fails policy review.

Read `plugins/code-review/skills/code-review/SKILL.md` for a worked example.

---

## Step 2 — Write the catalog entry

Create `catalog/<area>/<team>/<name>.yaml`. This is the single definition point: name,
version, and description live here and nowhere else.

```yaml
name: my-artifact
displayName: My Artifact
version: 0.1.0
description: >-
  What it does, and when to use it, in the words someone would actually search for.
  Between 40 and 400 characters.
category: development
scope: team
owner_team: backend
maturity: experimental
data_classification: internal
tools: [claude, codex, cursor]
artifact_types: [skill]
keywords: [words, people, would, search, for]
```

### Field reference

| Field | Required | Values | Notes |
|---|---|---|---|
| `name` | yes | lowercase kebab-case | **Immutable.** It is what people type in `install <name>@acme`. Must match the directory under `plugins/`. |
| `description` | yes | 40–400 chars | See [Writing the description](#writing-the-description). |
| `category` | yes | `development`, `productivity`, `security`, `data`, `monitoring`, `design`, `testing`, `deployment` | Extend the list in `marketplace.config.json` if you truly need a new one. |
| `scope` | yes | `company`, `area`, `team` | Should agree with where the file sits. |
| `owner_team` | yes | a team in `.github/CODEOWNERS` | Must be a team that can be paged about this. |
| `maturity` | yes | `experimental`, `supported`, `deprecated` | `experimental` relaxes description and atomicity checks to warnings. Start there. |
| `tools` | yes | any of `claude`, `codex`, `cursor` | Only skills project to Codex and Cursor. Declaring a tool you do not support fails I6. |
| `version` | recommended | semver | Needed for release tags and for packs to constrain you. |
| `displayName` | no | free text | Shown in the UI. The mutable label, unlike `name`. |
| `data_classification` | no | `public`, `internal`, `confidential` | Declare the highest class of data this can touch. |
| `artifact_types` | no | `skill`, `agent`, `mcp`, `hook`, `command`, `pack` | Documentation and site filtering. |
| `keywords` | no | list of strings | Synonyms and plurals — search has no stemming, so `deploy` will not match `deploys`. |
| `homepage` | no | URL | Internal docs for this artifact. |
| `dependencies` | packs only | see [Adding a pack](#adding-a-pack) | Presence of this field makes the entry a pack. |
| `superseded_by` | if deprecated | artifact name | Required when `maturity: deprecated`. |
| `skills.<n>.description` | multi-skill only | 40–400 chars | Required when the plugin ships more than one skill. |

### Writing the description

The description does three jobs at once, which is why it has its own rules:

1. It is the **search field** on the catalog page.
2. It is what a person reads before installing.
3. It is what the model uses to decide **whether to trigger the skill**.

So: state *what it does* **and** *when to use it*, using the words someone would type.

```yaml
# Bad — no trigger conditions, unsearchable
description: Helps with deployments.

# Good
description: >-
  Prepare and verify a service deployment: check the release checklist, confirm migrations
  are backward compatible, and produce the rollout and rollback plan. Use when shipping a
  backend service to staging or production.
```

Optimizing for search and optimizing for activation turn out to be the same work.

---

## Step 3 — Generate and validate

```bash
npm run ci
```

This regenerates `.claude-plugin/marketplace.json`, your `plugin.json`, your `SKILL.md`
frontmatter, the pack manifests, the site index, and the Codex/Cursor projections — then runs
every guardrail. Fix anything it reports before opening a PR.

### Never edit these by hand

They are generated, and the next build overwrites them:

- `.claude-plugin/marketplace.json`
- `plugins/*/.claude-plugin/plugin.json`
- The frontmatter block at the top of any `SKILL.md`
- `plugins/pack-*/` — entirely generated from `catalog/packs/`
- `docs/data/index.json`, `dist/`

Change the catalog entry instead. CI fails the PR if a generated file does not match what the
catalog produces, so a hand edit is caught rather than silently lost.

---

## Step 4 — Try it for real

A local git repository works as a marketplace source, so you can exercise the real client
before anyone else sees your change:

```bash
git add -A && git commit -m "add my-artifact"
claude plugin marketplace add "$(pwd)"
claude plugin install my-artifact@acme
```

The client reads the **committed** tree, not your working directory — commit first or you
will test the previous state. Clean up afterwards:

```bash
claude plugin uninstall my-artifact@acme --prune -y
claude plugin marketplace remove acme
```

Then actually use it on a real task. An artifact that passes CI but never triggers, or
triggers on the wrong thing, is a description problem — go back to step 2.

---

## Step 5 — Open the PR

The template carries the policy checklist. Fill in the verdict block honestly; it is the
layer that catches what scripts cannot ([`.github/policy/README.md`](.github/policy/README.md)).

Review is routed automatically by `CODEOWNERS` based on your catalog path.

---

## Step 6 — Tag the release

After merge, from the plugin directory:

```bash
cd plugins/<name>
claude plugin tag --push
```

This creates `<name>--v<version>` and pushes it. Version resolution reads these tags, so an
artifact without one cannot be the target of a semver constraint — invariant I10 warns about
it, and errors if a pack already constrains you
([ADR-0010](docs/adr/0010-versioning-and-releases.md)).

Use `--dry-run` first if you want to see what it would do.

---

## Adding a pack

A pack is a plugin manifest containing nothing but dependencies. Installing it installs
everything in it ([ADR-0005](docs/adr/0005-packs-via-native-dependencies.md)).

Create only `catalog/packs/pack-<name>.yaml` — the plugin directory is generated:

```yaml
name: pack-backend
displayName: Backend Pack
version: 1.0.0
kind: pack
description: >-
  Standard artifact set for backend engineers. Install this when you join a backend team.
category: productivity
scope: team
owner_team: backend
maturity: supported
tools: [claude]
dependencies:
  - code-review                  # tracks whatever the marketplace provides
  - name: deploy-kit             # pinned to a semver range
    version: ^2.0.0
```

Rules:

- Prefix the name with `pack-`.
- Use a bare string unless the coupling is real and tested. A range on everything turns the
  pack into a hand-maintained lockfile nobody updates.
- A constrained dependency **must** have a release tag, or the constraint cannot resolve
  (invariant I10 errors on this).
- Dependencies must exist in this marketplace and must not be `deprecated`.

**Adding an artifact to an existing pack requires publishing a new pack version.** Auto-update
is off by default for non-Anthropic marketplaces, so people who already have the pack pick up
the addition only after `claude plugin update pack-backend` and `/reload-plugins`. Tell the
team; it does not propagate on its own.

---

## When you need a hook

Hooks work in Claude Code only, and they run on every matching event whether or not the user
is thinking about your artifact. Policy review is strict about them:

- **Gate it.** A `UserPromptSubmit`, `PreToolUse`, or `PostToolUse` hook that runs without a
  relevance check — only when a marker file exists, only in a matching project type — fails
  review as a broad-scope hook.
- **Disclose network calls.** Any outbound call to a host other than your declared MCP server
  needs explicit disclosure and a documented opt-out in the description or README. Anonymous
  telemetry is still telemetry.
- **Do not declare `codex` or `cursor` in `tools:`.** Hooks do not project; invariant I6
  rejects the combination rather than shipping a fraction of your artifact.

Before writing one, check whether a skill would do. Usually it would.

---

## Deprecating an artifact

Do not delete the catalog entry — that breaks everyone who has it installed. Instead:

```yaml
maturity: deprecated
superseded_by: the-new-artifact
```

The artifact stays installable, is marked on the site, and is blocked from entering new packs.
Delete the entry months later, after installs have drained.

**Renaming is not possible.** `name` is an immutable slug. To change the displayed label, set
`displayName`. If a rename is genuinely unavoidable, add a `renames` entry so existing installs
migrate ([ADR-0002](docs/adr/0002-adopt-anthropic-marketplace-format.md)).

---

## Invariant reference

What CI enforces, and what to do when it fires. IDs match
[ADR-0007](docs/adr/0007-guardrails-and-atomicity.md).

| ID | Rule | Fix |
|---|---|---|
| `schema` | Required fields present, enum values valid | Correct the catalog entry against the field reference above |
| `I1` | Names unique, immutable, and matching between catalog and manifest | Do not rename. Deprecate, or add a `renames` entry |
| `I2` | External sources are SHA-pinned | Add the `sha` to the source object |
| `I3` | `SKILL.md` frontmatter valid, `name` matches its directory | Run `npm run build`; do not hand-edit frontmatter |
| `I4` | Description is 40–400 characters | Rewrite it to say what it does and when to use it. Warning only for `experimental` |
| `I5` | One artifact, one purpose; `SKILL.md` under 500 lines | Split the artifact, or move detail into `references/` |
| `I6` | `tools:` matches what actually projects | Remove `codex`/`cursor`, or express the logic as a skill |
| `I7` | Dependency graph has no cycles, missing targets, or deprecated targets | Fix the `dependencies` list in the pack |
| `I8` | `owner_team` exists in `CODEOWNERS` | Use a real team, or add it to `.github/CODEOWNERS` |
| `I9` | MCP servers point at allowlisted hosts | Use an internal host, or extend `policy.allowedMcpHosts` with security review |
| `I10` | Declared version has a release tag | Run `claude plugin tag --push` after merge |

Beyond these, [`.github/policy/prompt.md`](.github/policy/prompt.md) covers what scripts
cannot judge: hook scope, undisclosed telemetry, whether the description matches actual
behavior, and whether the declared data classification is accurate.

---

## Changing the model itself

Schema, directory layout, pipeline, or artifact format changes need an ADR first. Read
[`docs/adr/README.md`](docs/adr/README.md), then add a numbered file and reference it in your
PR. An accepted ADR is immutable — to change a decision, supersede it with a new one.
