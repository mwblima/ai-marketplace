---
name: deploy-kit
description: "Prepare and verify a service deployment: check the release checklist, confirm
  migrations are backward compatible, and produce the rollout and rollback plan. Use when
  shipping a backend service to staging or production."
---

# Deploy kit

Take a service from "merged" to "safely rolled out". Produce a plan; do not run the deploy.

## Preflight

Verify each item and report it as pass or fail with evidence. Do not proceed past a
failure — report it and stop.

1. **Green build** on the commit being deployed, not on the branch tip.
2. **Migrations are backward compatible.** The previous version of the code must keep
   running against the new schema for the duration of the rollout. Adding a non-nullable
   column without a default, renaming a column, or dropping one still in use all fail this.
   The safe form is expand → migrate → contract, across three releases.
3. **Config and secrets** referenced by the new code exist in the target environment.
4. **Feature flags** default to off for anything not yet exercised in staging.
5. **Dependencies** on other services are already deployed if the new code requires them.

## Rollout plan

State the strategy and the concrete numbers:

- **Order** — which services deploy first when there is a dependency between them.
- **Stages** — the traffic percentages and the wait between them.
- **Health signals** — the specific metrics to watch, with the threshold that aborts.
  Error rate and p99 latency at minimum; name the dashboards.
- **Bake time** — how long the final stage runs before the deploy is called done.

## Rollback plan

Every plan states, explicitly:

- The command or action that reverts the code.
- Whether the migration is reversible. If it is not, say so plainly and describe what the
  recovery actually looks like — a forward fix, a restore, or manual repair.
- The point of no return: the step after which rollback stops being possible.

A deployment whose rollback is "we would have to restore from backup" is not ready. Say
that outright rather than filling in the section.

## Output

A checklist of preflight results, then the rollout plan, then the rollback plan. Close with
a one-line verdict: `Safe to deploy`, `Safe with caveats`, or `Do not deploy`, followed by
the single most important reason.
