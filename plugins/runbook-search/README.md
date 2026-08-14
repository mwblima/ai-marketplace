# Runbook Search

Finds and applies the company's operational runbooks during an incident.

## What it ships

| Surface | What it is |
|---|---|
| `skills/runbook-search` | The entry point: how to search, and how to apply what you find. |
| `agents/incident-responder.md` | A subagent for working an active incident end to end, keeping a timeline. |
| `.mcp.json` | The internal runbook MCP server, `mcp.internal.acme.example`. |

The MCP host is on `policy.allowedMcpHosts` in `marketplace.config.json`; invariant I9 fails
the build for any host that is not.

## Install

```bash
claude plugin install runbook-search@acme
```

Claude Code only. MCP configuration and agents do not project to Codex or Cursor
([ADR-0004](../../docs/adr/0004-skill-md-as-canonical-format.md)).

## Access

The MCP server authenticates with the same SSO session as the internal wiki. If searches
return nothing at all, check that session before assuming the runbook is missing.

## Maintainers

Owned by `@acme/platform`.
