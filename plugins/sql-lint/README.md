# SQL Lint

> **Deprecated — use [`dbt-helper`](../dbt-helper/) instead.**
>
> ```bash
> claude plugin install dbt-helper@acme
> ```

Checked raw SQL against the data team's naming and formatting conventions.

`dbt-helper` applies the same conventions and additionally covers the tests and
documentation the model needs, which is where most of the review time actually went.

## Why it is still here

Deprecation is a state, not a deletion ([ADR-0010](../../docs/adr/0010-versioning-and-releases.md)).
Removing the entry would break every existing install and every semver constraint pointing
at it. It stays installable and stops changing; the catalog marks it `deprecated` with
`superseded_by: dbt-helper`, the site shows the migration target, and invariant I7 refuses
any new pack dependency on it.

## Maintainers

Owned by `@acme/data`. No further changes are planned.
