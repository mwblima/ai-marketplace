# Incident Comms

Drafts customer-facing incident updates in the company's voice.

## What it does

Produces the update itself — affected scope, confirmed status, action, and the time of the
next update — with the rules support already applies by hand: no unconfirmed cause, no
internal service names, no escalating language.

It writes the customer-facing message. It does not decide severity, and it does not post
anything to the status page.

## Install

```bash
claude plugin install incident-comms@acme
```

Codex and Cursor: see [Installing on Codex and Cursor](../../docs/adoption/other-tools.md).

## Maintainers

Owned by `@acme/support`. This is a support-owned artifact in an engineering-shaped
catalog — the directory under `catalog/support/` is what routes its review
([ADR-0003](../../docs/adr/0003-single-marketplace-modular-catalog.md)).
