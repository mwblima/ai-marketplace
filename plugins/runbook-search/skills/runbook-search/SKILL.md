---
name: runbook-search
description: Find and apply the company's operational runbooks during an incident, using the
  internal runbook MCP server. Use when a service is degraded and you need the documented
  procedure rather than an improvised one.
---

# Runbook search

Find the documented procedure for an operational situation, and apply it as written.

## Where runbooks live

The `runbooks` MCP server (`mcp.internal.acme.example`) is the only source. Runbooks in wikis
and chat threads are copies, and copies are how procedures drift. If the server is
unreachable, say so rather than falling back to a remembered version.

## How to search

1. **By service** — the service name as it appears in the service catalog, not its informal
   name. `checkout-api`, not "checkout".
2. **By symptom** — when the failing service is not yet known: `elevated 5xx`,
   `replication lag`, `queue backlog`.
3. **By alert name** — paste the alert exactly as the pager delivered it.

Return the runbook whose *preconditions* match the situation. A runbook for the same service
under different preconditions is the wrong runbook, and following it is worse than having
none.

## Applying one

State which runbook you are following, by name and version, before the first step. Then work
it in order. For each step, report what you did and what you observed.

Stop and escalate when:

- A step's precondition does not hold.
- Two steps disagree, or a step refers to a system that no longer exists.
- The runbook's expected outcome does not materialize after the step it belongs to.

## When nothing matches

Say so in one line, then help without one. At the end, propose the runbook that should have
existed: trigger, preconditions, steps, and how to verify it worked. That draft is the most
valuable output of an incident with no runbook.
