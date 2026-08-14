# Policy review

This directory holds layer 3 of the guardrails (ADR-0007): the checks a script cannot make.

| File | What it is |
|---|---|
| [`prompt.md`](prompt.md) | The policy itself. Written as instructions to a reviewer — human or model. |
| [`schema.json`](schema.json) | The shape of a verdict. Every review produces this object, whoever performs it. |
| [`example-verdict.json`](example-verdict.json) | A completed review of `plugins/format-guard/`, the artifact in this catalog that registers a hook. |

Read the example before your first review. It is deliberately a review of a **hook**, not a
skill: the fields that carry the weight — `hooks`, `has_broad_scope_hooks`,
`may_download_additional_software` — are only exercised by an artifact that can act outside
its own invocation, and its `_notes` record what the reviewer actually had to look at,
including the one flag (`npx --no-install`) that decided a field.

Layers 1 and 2 — schema validation and the CI invariants — run in `scripts/validate.mjs`
and block the PR in seconds. They catch malformed entries, broken dependency graphs,
unowned artifacts, and MCP hosts outside the allowlist.

They cannot catch: a hook that observes more than its purpose justifies, a telemetry call
with no disclosure, or a description that is technically true but omits the interesting part.
That is what this layer is for.

## How it runs today

A human reviewer reads `prompt.md`, inspects the artifact, and fills in the verdict block in
the PR template. The verdict is a structured JSON object, not prose, which means reviews stay
comparable across reviewers and can be audited later.

**The separation is the point.** The policy is written as a prompt and the verdict as a
schema *before* any automation exists, so the decision of who executes it — a person today, a
model later — does not require rewriting the policy. Start here even if you intend to
automate immediately: a policy you have applied by hand a dozen times is one you can trust a
model to apply.

## Automating it

Three options, cheapest first. All of them consume the same `prompt.md` and produce the same
`schema.json` verdict.

### Option 1 — Reviewer assist (recommended first step)

Keep the human as the decision maker, but have a model do the reading. The reviewer runs the
policy locally against the changed artifact and pastes the verdict into the PR:

```bash
claude -p "$(cat .github/policy/prompt.md)

Review the artifact in plugins/<name>/. Output ONLY a JSON object matching
.github/policy/schema.json." --allowedTools Read Glob Grep
```

No CI setup, no credentials in the pipeline, and the reviewer stays accountable for the
verdict. This is the highest value per unit of effort, and for most companies it is enough.

### Option 2 — Advisory CI job

Run the same prompt in CI on PRs that touch `plugins/**` or `catalog/**`, and post the
verdict as a PR comment **without** blocking the merge. Requires an API key in repository
secrets.

Run it in advisory mode for a few weeks first. You will discover that some of your policy
rules are ambiguous, and you want to discover that while the job is not blocking anyone.

Two things to get right before turning this on:

- **Cache verdicts.** Key on the artifact content hash so the same unchanged artifact is not
  re-reviewed on every push. Anthropic's own marketplace caches on `(plugin, sha)` and
  invalidates the whole cache when the policy file changes — a good pattern to copy.
- **Treat model output as untrusted.** The verdict text is shaped by files in the PR, which
  a contributor controls. Strip markdown control characters before rendering it into a PR
  comment or job summary, and never interpolate it into a shell command.

### Option 3 — Blocking required check

Promote the advisory job to a required status check once its verdicts have matched reviewer
judgment for long enough that you trust it.

Two failure modes to design for before this gates merges:

- **Infrastructure failure must not read as a pass.** If the job fails without producing a
  parseable verdict — clone error, API error, timeout — fail loudly. A missing verdict is not
  an approval.
- **Prompt injection.** The reviewer reads files from the PR, and those files can contain
  text addressed to the reviewer. `prompt.md` instructs the model to treat such text as a
  finding rather than an instruction, but scope the job's credentials to the minimum
  regardless, and prefer short-lived tokens over a long-lived key.

## A note on the reference implementation

Anthropic's official marketplace runs Option 3 through a shared action with Workload Identity
Federation. That action is bound to their organization's identity infrastructure and is not
reusable outside it — if you want automation, you are implementing it yourself, and the
options above are what that looks like.

## Adapting the policy

`prompt.md` encodes assumptions about a company. Review at minimum:

- **Part 3** is entirely company-specific: MCP host allowlist, data classification levels,
  what "a team that can be paged" means in your organization.
- **The verdict threshold.** Which findings fail versus inform is a policy choice, not a
  technical one. `is_atomic` is advisory here because splitting an artifact is a design
  conversation; you may disagree.
- **The allowlist** in `marketplace.config.json` under `policy.allowedMcpHosts`, which
  invariant I9 enforces mechanically.
