# Managed settings

Ready-to-apply configuration for the three distribution scopes in
[ADR-0009](../adr/0009-distribution-via-managed-settings.md). Replace `acme` and the
repository path with your own before use.

## Scope 1 — Company (machine), via MDM

Deploy `managed-settings.json` to the managed settings path on every machine:

| Platform | Path |
|---|---|
| macOS | `/Library/Application Support/ClaudeCode/managed-settings.json` |
| Linux | `/etc/claude-code/managed-settings.json` |
| Windows | `C:\ProgramData\ClaudeCode\managed-settings.json` |

This file does three things:

- `extraKnownMarketplaces` registers the marketplace with no user action.
- `strictKnownMarketplaces` restricts which marketplaces can be added at all. This is the
  control that actually enforces governance — it keeps unreviewed artifacts out.
- `enabledPlugins` enables the onboarding pack by default.

Managed settings are read-only to the client, so users cannot override them.

For Codex, the same MDM package should drop company-scope skills into `/etc/codex/skills`,
which takes precedence over user-scope skills.

**Without MDM**, scope 1 is unavailable. Scopes 2 and 3 still work; you lose origin
enforcement, not distribution.

## Scope 2 — Team (repository)

Commit `project-settings.json` as `.claude/settings.json` in each team repository. Anyone who
clones and trusts the folder is prompted to install the marketplace and gets the team pack
enabled.

This is the cheapest and most useful scope: no MDM, one file, and it puts the right context
in front of whoever joins the project.

For Codex and Cursor in the same repository, symlink the skills into `.agents/skills` and
`.cursor/skills` using the installers under `dist/`.

## Scope 3 — Individual

Manual installation from the site or `/plugin`. Always allowed within the allowlist:

```bash
claude plugin marketplace add your-org/ai-marketplace
claude plugin install code-review@acme
```

## Verifying the rollout

```bash
claude plugin marketplace list
claude plugin list --json
```

`claude plugin list --json` reports an `errors` field on any plugin that failed to load,
which is the fastest way to catch a broken pack dependency after a rollout.
