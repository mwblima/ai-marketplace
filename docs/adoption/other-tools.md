# Installing on Codex and Cursor

`SKILL.md` is byte-identical across Claude Code, Codex, and Cursor, so skills are copied
rather than translated. See [ADR-0004](../adr/0004-skill-md-as-canonical-format.md) for why
the Claude Code plugin is the canonical form.

## Where each tool looks for skills

| Tool | Scope | Path |
|---|---|---|
| Codex | repo | `$REPO_ROOT/.agents/skills` |
| Codex | user | `$HOME/.agents/skills` |
| Codex | admin | `/etc/codex/skills` |
| Cursor | repo | `.cursor/skills` |
| Cursor | user | `~/.cursor/skills` |

Codex loads the highest-priority match when the same skill name appears in several scopes,
and it follows symlinked skill folders — which is why the installers symlink instead of copy.

## User scope

```bash
git clone https://github.com/your-org/ai-marketplace
cd ai-marketplace

./dist/codex/install.sh      # links into ~/.agents/skills
./dist/cursor/install.sh     # links into ~/.cursor/skills
```

Pass a different destination as the first argument:

```bash
./dist/codex/install.sh /etc/codex/skills
```

Because the links point back into the clone, `git pull` updates every installed skill at
once. There is no second update step.

## Repository scope

To give everyone working in a repository the same set, link the skills into the repository
itself and commit the result:

```bash
./dist/codex/install.sh  /path/to/your-repo/.agents/skills
./dist/cursor/install.sh /path/to/your-repo/.cursor/skills
```

For a repository other people clone, copy the skill directories in rather than symlinking —
a symlink pointing at a path on your machine is useless to everyone else.

## What does not project

- **Packs.** Dependency resolution is a Claude Code feature. On Codex and Cursor, install the
  set by running the installer, which links every skill the artifact ships.
- **Hooks.** Codex has no hook system. An artifact that declares `codex` in `tools:` while
  shipping hooks fails CI (invariant I6).
- **MCP servers.** Each tool configures MCP differently. The artifact's README documents the
  per-tool setup; nothing is generated for it.
- **Commands.** Projected to Cursor as `.cursor/commands`. Not projected to Codex, which
  deprecated custom prompts in favor of skills.
