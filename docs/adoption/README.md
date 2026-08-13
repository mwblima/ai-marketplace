# Adopting this model

This repository is a **starting point, not a product**. Fork it, strip the examples, and you
have a governed AI artifact platform without designing one from scratch.

The whole thing is a catalog, three scripts, and a static page. There is no service to run,
no database, and one dependency. That is deliberate: a governance platform that needs its own
operations team does not get adopted.

Budget about an afternoon for steps 1–5.

## 1. Decide the two things that are hard to change later

**The marketplace name.** It appears in every install command (`install code-review@acme`)
and in every managed-settings file. Changing it later means every user re-registers. Pick the
company short name.

**Repository visibility.** This reference repo is public. Yours almost certainly should not
be — a catalog exposes team names, internal tooling, and workflows. Read the consequences
before deciding, because two of them are not obvious:

- Private repos change which **plugin sources** are reachable
  ([ADR-0002](../adr/0002-adopt-anthropic-marketplace-format.md)).
- GitHub Pages with private visibility requires Enterprise Cloud, and publishing a *public*
  site from a private repo leaks exactly what you went private to protect
  ([ADR-0008](../adr/0008-static-site-on-github-pages.md)).

## 2. Make it yours

```bash
# Replace the example content
rm -rf catalog/company/* catalog/engineering catalog/packs/* plugins/*
```

Then edit:

| File | What to change |
|---|---|
| `marketplace.config.json` | `marketplace.name`, `owner`, `site.*`, `teams`, `policy.allowedMcpHosts`, and the category list |
| `.github/CODEOWNERS` | Your org's teams and directory boundaries |
| `docs/managed-settings/*.json` | Your marketplace name and repository path |
| `LICENSE` | Your copyright, or your company's standard license |

Reshape `catalog/` to your org. The directory layout **is** the ownership model
([ADR-0003](../adr/0003-single-marketplace-modular-catalog.md)) — if you are not organized
into areas and teams, use whatever boundary your `CODEOWNERS` can actually route to.

## 3. Publish one real artifact

Not a placeholder. Pick something a team already keeps in a local file and move it in — the
model only proves itself on something people already wanted.

```bash
mkdir -p plugins/<name>/skills/<name>
# write the SKILL.md body, then the catalog entry, then:
npm run ci
```

## 4. Test before publishing

A local git repository works as a marketplace source, so you can exercise the real client
before anyone else sees it:

```bash
git commit -am "first artifact"
claude plugin marketplace add "$(pwd)"
claude plugin install <name>@<your-marketplace>
```

The client reads the **committed** tree, not the working directory. Clean up with
`claude plugin marketplace remove <your-marketplace>`.

## 5. Turn on CI

`.github/workflows/ci.yml` works as-is. Make `validate` a required status check on `main` —
without that, the guardrails are advice rather than governance.

`.github/workflows/pages.yml` needs a decision from step 1 before you enable it.

## 6. Distribute (when you have three or four artifacts)

Do not start here. Enforcement before there is anything worth installing produces a policy
nobody benefits from and everybody notices.

When you are ready, [ADR-0009](../adr/0009-distribution-via-managed-settings.md) covers the
three scopes and `docs/managed-settings/` has the files. The cheapest and most useful one is
scope 2: a `.claude/settings.json` committed in a team's repository. It needs no MDM and puts
the right artifacts in front of whoever clones the project.

## 7. Policy review

Start with the human checklist that ships in the PR template. See
[`.github/policy/README.md`](../../.github/policy/README.md) for how to automate it later,
and why writing the policy before automating it is the right order.

## What to change and what to keep

Nothing here is sacred, but some decisions cost more to reverse than others.

**Likely to change per company:** the category and team taxonomy, the maturity levels, the
policy rules in Part 3 of `prompt.md`, the site styling, whether you need Codex and Cursor at
all.

**Change carefully:** name immutability (ADR-0002) and the generated-not-hand-edited rule
(ADR-0011). Both look like ceremony until the first time someone renames an artifact and
breaks every install, or fixes a description in one of three places.

**The reasoning is the artifact.** Every decision is recorded in [`docs/adr/`](../adr/)
with the alternatives that were rejected and why. When you disagree with one, write an ADR
that supersedes it rather than silently changing the code — your successors will need the
same context you had.
