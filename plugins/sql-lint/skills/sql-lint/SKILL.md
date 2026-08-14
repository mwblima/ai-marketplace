---
name: sql-lint
description: Check raw SQL against the data team's naming and formatting conventions.
  Superseded by dbt-helper, which covers the same conventions plus tests and documentation
  for the models the SQL belongs to.
---

# SQL lint

> **Deprecated.** Use `dbt-helper` instead: `claude plugin install dbt-helper@acme`.
> It applies the same conventions and additionally covers tests and documentation for the
> model the SQL belongs to. This skill is kept installable so existing users are not broken,
> and will not receive further changes.

Check raw SQL against the data team's conventions.

## Conventions

- Snake case for every identifier. No quoted mixed-case names.
- `select` lists one column per line, no `select *` outside ad-hoc exploration.
- Explicit join type on every join, and an `on` clause on every join — never a comma join.
- CTEs named for what they contain, not `a`, `b`, `tmp`.
- No implicit cross-database references; qualify with the database and schema.

## Output

One finding per line, as `line — issue — the corrected form`. If the SQL belongs to a dbt
model, stop and say that `dbt-helper` is the right artifact for it.
