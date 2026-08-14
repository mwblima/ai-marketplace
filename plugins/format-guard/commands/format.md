---
description: Format the files changed in the working tree with the repository's own formatter.
---

Format the files changed in the working tree, using the formatter this repository already
declares — do not introduce a new one.

1. List changed files with `git diff --name-only` plus `git diff --cached --name-only`.
2. Identify the declared formatter: `.prettierrc` (Prettier), `[tool.ruff]` in
   `pyproject.toml` (Ruff), or a `format` script in `package.json`.
3. If none is declared, say so and stop. Choosing a formatting standard is a decision for
   the repository's owners, not for this command.
4. Run the formatter on the changed files only, never on the whole tree.
5. Report which files changed. If the formatter rewrote a file the user did not touch in
   this session, call that out separately.
