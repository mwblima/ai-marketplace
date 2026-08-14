# Working in this repository

<!-- Generated from CLAUDE.md by scripts/build.mjs. Edit CLAUDE.md instead. -->

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
`superseded_by` — never delete the entry.

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

It regenerates everything and runs all guardrails. A change is not done until it is clean.

## Structural changes need an ADR

Schema, directory layout, pipeline, or artifact format changes require an ADR in
`docs/adr/` first. Accepted ADRs are immutable; supersede rather than edit. See
[docs/adr/README.md](docs/adr/README.md).
