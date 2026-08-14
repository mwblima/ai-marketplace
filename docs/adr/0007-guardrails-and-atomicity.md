# ADR-0007 — Quality guardrails and artifact atomicity

- **Status:** Accepted
- **Date:** 2026-08-12

## Context

An internal marketplace degrades in a predictable way: oversized artifacts that do five
things, vague descriptions that stop the model from triggering the right skill, hooks that
observe every session, MCP servers pointing at arbitrary hosts, and abandoned items nobody
can vouch for. When that happens, people stop trusting the catalog and go back to copying
prompts into local files.

The Anthropic pattern attacks this in two separate layers, and the separation is the smart
part: **deterministic validation** (`validate-plugins.yml`, schema and invariants) and
**policy review** (`scan-plugins.yml`, a model reading the shipped payload against
`.github/policy/prompt.md`, with output forced into `.github/policy/schema.json` — fields
such as `passes`, `violations`, `has_broad_scope_hooks`, `has_undisclosed_telemetry`, and
`description_matches_behavior`).

## Decision

Three layers, cheapest to most expensive.

### 1. Schema (blocking, instant)

Required fields and enum membership on every `catalog/**/*.yaml`, checked at the top of
`scripts/validate.mjs`: `name`, `description`, `owner_team`, `scope`, `maturity`, `tools`,
`category`, and `artifact_types` for anything that is not a pack.

The schema lives in code rather than in a `catalog.schema.json`, because the enums it
validates are read from `marketplace.config.json` — the categories, teams, maturities, and
allowlists a company edits on day one. Two files defining the same rules is exactly the
duplication ADR-0011 exists to prevent.

### 2. CI invariants (blocking, seconds)

| # | Invariant | Rationale |
|---|---|---|
| I1 | `name` unique, immutable, and retired only through `marketplace.renames` | Renaming breaks installs (ADR-0002) |
| I2 | External sources pin a 40-character `sha` and sit on `policy.allowedPluginRepos` | `ref: main` changes content after review; an unlisted repo was never reviewed |
| I3 | `SKILL.md` and agent frontmatter have valid `name` and `description` | Without it the artifact cannot be triggered |
| I4 | `description` is 40–400 characters and states *when to use* | It is the search field (ADR-0006) and the activation trigger |
| I5 | One artifact, one purpose (see atomicity below) | Composition only works if the pieces are small |
| I6 | `tools:` consistent with content (declares `codex` but uses hooks → fail) | Prevents broken projections (ADR-0004) |
| I7 | `dependencies` graph has no cycles, no missing targets, no `deprecated` targets | Prevents broken packs (ADR-0005) |
| I8 | `owner_team` exists in `CODEOWNERS` | An artifact without an owner is a dead artifact |
| I9 | MCP servers point at hosts on the internal allowlist | Data guardrail |
| I10 | A declared `version` has a matching release tag | An unresolvable semver constraint fails silently (ADR-0010) |
| I11 | `artifact_types` matches the surfaces actually shipped, in both directions | An undeclared hook is reach nobody reviewed (ADR-0012) |
| I12 | `superseded_by` names a live artifact | A deprecation pointing nowhere strands its users (ADR-0010) |
| I13 | `last_reviewed` is present and inside `policy.reviewMaxAgeDays` — warning | Catalogs die of abandonment, not of bad artifacts (ADR-0012) |
| I14 | Hooks are declared in `hooks/hooks.json`, carry a `matcher`, and ship the file they run | The one surface that runs without being asked (ADR-0012) |

Every invariant has a test in `tests/invariants.test.mjs` that builds a synthetic repository
violating it and asserts the guardrail fires. That suite is not incidental: the adoption
guide tells companies to change these rules, and a rule nobody can verify after changing is
a rule that quietly stops holding.

### 3. Policy review (blocking, minutes)

Adapt `.github/policy/prompt.md` and `schema.json` from the official pattern to company
rules, keeping the structured output. Add to the original checks: declared vs. observed data
classification, and MCP hosts outside the allowlist.

**In v1 this layer runs as a human review checklist**, using the same prompt and the same
output schema, filled in by the reviewer in the PR template. Automating it with a model in CI
is a later upgrade: it costs tokens per PR, and Anthropic's `scan-plugins` action depends on
their own federated-identity infrastructure and is not reusable as-is. The value is in having
the policy written down and the verdict structured — not in who executes it.

### Atomicity (I5), operationalized

"One artifact does one thing" is useless as a rule unless it is checkable. The proxies:

- A skill has **one** `SKILL.md` of at most ~500 lines; anything beyond that moves to
  `references/` and is loaded on demand.
- If the `description` needs the word "and" to list distinct purposes ("generates migrations
  **and** deploys"), that is two artifacts.
- Prefer a skill over a hook (ADR-0004): a skill is portable and opt-in; a hook is global and
  invisible.
- A plugin with more than five skills is a candidate to become a pack of smaller plugins.

The first two are script-checkable. The last two are review heuristics and live in the PR
template, declared openly as human judgment.

## Consequences

- The cost of publishing goes up. That is intentional: the bottleneck of an internal catalog
  is trust, not volume.
- Layers 1 and 2 give feedback in seconds and resolve most problems with no human involved.
- The written policy is reusable by another company as a starting point — one of the most
  valuable deliverables of the model.
- Risk: too many guardrails suppress contribution. Mitigation: `maturity: experimental`
  downgrades I4 and I5 to warnings, allowing a draft to be published and promoted later.

## Alternatives considered

- **Human review only, no CI** — rejected: does not scale and is inconsistent across
  reviewers.
- **CI only, no written policy** — rejected: syntactic checks catch neither a hook that reads
  too much nor a description that misrepresents behavior.
- **Model-automated policy in v1** — deferred, not rejected. See layer 3.
