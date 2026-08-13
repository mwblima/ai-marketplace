# ADR-0007 — Quality guardrails and artifact atomicity

- **Status:** Proposed
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

`schema/catalog.schema.json` validates every `catalog/**/*.yaml`. Required fields: `name`,
`description`, `owner_team`, `scope`, `maturity`, `tools`, `category`.

### 2. CI invariants (blocking, seconds)

| # | Invariant | Rationale |
|---|---|---|
| I1 | `name` unique across the catalog and immutable across commits | Renaming breaks installs (ADR-0002) |
| I2 | External sources carry a pinned `sha` | `ref: main` changes content without review |
| I3 | `SKILL.md` frontmatter has valid `name` and `description` | Without it the artifact cannot be triggered |
| I4 | `description` is 40–400 characters and states *when to use* | It is the search field (ADR-0006) and the activation trigger |
| I5 | One artifact, one purpose (see atomicity below) | Composition only works if the pieces are small |
| I6 | `tools:` consistent with content (declares `codex` but uses hooks → fail) | Prevents broken projections (ADR-0004) |
| I7 | `dependencies` graph has no cycles, no missing targets, no `deprecated` targets | Prevents broken packs (ADR-0005) |
| I8 | `owner_team` exists in `CODEOWNERS` | An artifact without an owner is a dead artifact |
| I9 | MCP servers point at hosts on the internal allowlist | Data guardrail |

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
