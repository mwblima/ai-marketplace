# Working in this repository

This is a marketplace of AI artifacts. Read [CONTRIBUTING.md](CONTRIBUTING.md) before
creating or editing anything under `catalog/` or `plugins/` — it has the exact file
templates, the full catalog field reference, and every CI invariant with its fix.

The rules below are the ones most often broken. They are not style preferences; each one
corresponds to a check that fails the build.

## The catalog is the only definition point

An artifact is defined in **one** file: `catalog/<area>/<team>/<name>.yaml`. A contributor
writes that, plus the **body** of `plugins/<name>/skills/<name>/SKILL.md`.

Never hand-edit these — they are generated, and `npm run ci` overwrites them:

- `.claude-plugin/marketplace.json`
- `plugins/*/.claude-plugin/plugin.json`
- The frontmatter block of any `SKILL.md`
- `plugins/pack-*/` (generated from `catalog/packs/`)
- `docs/data/index.json`, `dist/`

If a description or version needs to change, change the catalog entry and run `npm run ci`.

## Names are immutable

`name` is the slug people have installed. Renaming it breaks every existing install. To
change the label, set `displayName`. To retire an artifact, set `maturity: deprecated` and
`superseded_by`, pointing at an artifact that exists and is not itself deprecated (I12) —
never delete the entry.

If a name genuinely has to disappear, add `old: new` to `marketplace.renames` in
`marketplace.config.json` in the same PR that removes it. That map is what migrates existing
installs, and I1 fails the build without it.

## Declare every surface an artifact ships

`artifact_types` lists what the plugin installs: `skill`, `agent`, `command`, `hook`, `mcp`.
Invariant I11 checks it in both directions — declaring something you do not ship fails, and
**shipping something you did not declare fails**. A hook that appears without a catalog
change is reach nobody reviewed (ADR-0012).

Hooks additionally have to be real (I14): a `hooks/hooks.json`, a `matcher` on every
`PreToolUse`/`PostToolUse` entry, and the script they invoke shipped with the artifact.

## Keep `last_reviewed` honest

`last_reviewed` is the day the owning team last confirmed the artifact is still correct.
CI warns past 180 days and the site marks it "unreviewed". Bumping the date without
rereading the artifact defeats the only mechanism that notices abandonment.

## Descriptions do three jobs

The `description` is the search field, the install-time explanation, **and** the string the
model uses to decide whether to trigger the skill. Write what it does *and when to use it*,
in words someone would actually search for. 40–400 characters.

## Prefer a skill

A skill works in Claude Code, Codex, and Cursor, and is opt-in. A hook runs in one tool,
globally, and invisibly. Only skills project to other tools — declaring `codex` or `cursor`
in `tools:` while relying on hooks, commands, or MCP fails invariant I6.

## One artifact, one purpose

If the description needs "and" to list distinct jobs, it is two artifacts.

## Always run before finishing

```bash
npm run ci
```

It regenerates everything, runs all guardrails, and runs the guardrail tests. A change is
not done until it is clean.

## Changing a guardrail means changing its test

Every invariant has a test in `tests/invariants.test.mjs` that builds a synthetic repository
violating it and asserts the check fires. Adding, relaxing, or removing a rule in
`scripts/validate.mjs` without touching that suite leaves a rule nobody can verify.

## Structural changes need an ADR

Schema, directory layout, pipeline, or artifact format changes require an ADR in
`docs/adr/` first. Accepted ADRs are immutable; supersede rather than edit. See
[docs/adr/README.md](docs/adr/README.md).
