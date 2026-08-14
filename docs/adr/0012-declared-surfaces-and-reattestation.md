# ADR-0012 — Declared surfaces and periodic reattestation

- **Status:** Accepted
- **Date:** 2026-08-13

## Context

ADR-0007 built the guardrails around the artifact type the catalog actually had: skills.
Every example in the repository was a skill, so the invariants that matter most for the
other surfaces — hooks, MCP servers, agents, commands — were written but never exercised.

Two gaps followed from that, and a third came from operating the model rather than from its
code.

**An artifact's reach was invisible in the catalog.** `artifact_types` was a free-text list
nobody validated. A plugin could declare `[skill]` and ship a `hooks/` directory, and
nothing failed. The catalog is what a reviewer reads and what the site publishes, so a
surface missing from it is a surface nobody chose to accept. Hooks are the sharp case: they
run without the user asking, on events the user did not trigger deliberately.

**Nothing checked that a hook was scoped.** The policy prompt asks a reviewer to judge
whether a hook is "gated to contexts relevant to its purpose" (Part 2), which is a judgment
call. But it rests on mechanics that are not judgment calls at all: a `PreToolUse` hook with
no `matcher` fires on every tool call, and a hook pointing at a script that does not ship is
simply broken. Asking a human to catch those is spending review attention on something a
script does better.

**Nothing decayed.** Internal catalogs do not fail because a bad artifact gets in. They fail
because good artifacts stop being true — the deploy checklist changes, the team reorganizes,
the convention is abandoned — and nobody notices, because nothing ever asks. `maturity` is
manual, and no owner has ever spontaneously downgraded their own artifact.

## Decision

**1. `artifact_types` is a contract, enforced in both directions (I11).**

Declaring a surface the artifact does not ship fails. Shipping a surface the artifact did
not declare fails. The surfaces are fixed: `skill`, `agent`, `command`, `hook`, `mcp`, each
mapping to one path inside the plugin directory.

The second direction is the one that matters. It makes "this artifact registers a hook" a
fact stated in the catalog, visible on the site, and reviewable in the PR diff of a
seventeen-line YAML file — rather than something a reviewer discovers by listing
directories.

**2. Hook mechanics are checked, hook intent is reviewed (I14).**

CI checks what is decidable: `hooks/` contains a `hooks.json`, every `PreToolUse` and
`PostToolUse` entry carries a `matcher`, and every command referencing
`${CLAUDE_PLUGIN_ROOT}` points at a file that actually ships. Whether the matcher is *narrow
enough for the artifact's stated purpose* stays with the human reviewer, in `prompt.md`
Part 2 — that is a judgment about purpose, and a script has no access to purpose.

**3. Artifacts are reattested, not assumed (I13).**

`last_reviewed` is an ISO date the owning team sets when it confirms the artifact is still
correct. Past `policy.reviewMaxAgeDays` (180 by default), CI warns and the site marks it.

It is a **warning, never an error**, and it has to stay that way. A blocking staleness check
punishes whoever happens to open the next PR for a neglect that is not theirs, and the
reliable outcome is a drive-by date bump that reattests nothing. The value is in the signal
being visible on the site, where the person deciding whether to adopt an artifact sees it,
and in a periodic report the owning team can act on.

## Consequences

- The catalog entry now describes an artifact's reach, not only its purpose. A reviewer can
  see from one YAML file whether something installs a hook.
- Adding a hook to an existing artifact requires a catalog change, so it goes through
  `CODEOWNERS` review. This is the point.
- Every artifact carries a date that goes stale on its own. Some warnings will be ignored;
  a warning nobody acts on is still better than a fact nobody has.
- Freshness has a false-negative mode worth naming: an owner can bump the date without
  reviewing anything. The check makes neglect *visible*, not impossible.
- The invariant table grew from nine to fourteen. Each addition is covered by a test, which
  is what keeps the growth honest — an invariant nobody can verify is documentation.

## Alternatives considered

- **Leave `artifact_types` as documentation** — rejected. A field that is written but never
  checked is worse than no field: it reads as a guarantee to the next person.
- **Block on stale artifacts instead of warning** — rejected, above. It converts a
  maintenance signal into a tax on unrelated contributors.
- **Auto-deprecate artifacts past the freshness limit** — rejected. Deprecation is a
  statement about the artifact's replacement (I12); a script cannot say what replaces it,
  and a deprecation with no migration target is a broken promise on the site.
- **Measure adoption instead of asking for reattestation** — deferred, and worth stating
  explicitly because it is the obvious idea. Install and invocation counts are the honest
  signal for whether an artifact is still worth its place, and Claude Code can emit
  OpenTelemetry metrics that would carry them. It is deferred, not rejected, because usage
  telemetry is a decision about observing employees, not just artifacts, and it needs an
  answer to who sees the per-user data before it needs an implementation. A company adopting
  this model with that question already answered should collect the metrics and treat
  reattestation as the fallback for artifacts too rarely used to produce a signal.
- **A central registry of every hook in the company** — rejected. That is what the catalog
  already is once I11 holds; a second list would drift from the first.
