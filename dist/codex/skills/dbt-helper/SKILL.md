---
name: dbt-helper
description: Write and review dbt models following the data team's layering and naming
  conventions, including tests and documentation for every new model. Use when adding or
  changing a model in the analytics repository.
---

# dbt helper

Write and review dbt models against the data team's conventions.

> **Maturity: experimental.** The conventions below reflect current practice and are still
> being settled. Raise disagreements with `@acme/data` rather than working around them.

## Layering

A model belongs to exactly one layer, and may only select from the layer below it.

| Layer | Prefix | Selects from | Purpose |
|---|---|---|---|
| Staging | `stg_` | Sources only | One model per source table. Rename and cast, nothing else. |
| Intermediate | `int_` | Staging, intermediate | Joins and reshaping. Not exposed to consumers. |
| Marts | `dim_`, `fct_` | Intermediate, staging | The consumer-facing contract. |

A staging model that aggregates, or a mart that selects directly from a source, is a
layering violation. Report it.

## Conventions

- Primary key column is `<entity>_id`, and it is tested `unique` and `not_null`.
- Timestamps are UTC and suffixed `_at`. Dates are suffixed `_date`.
- Booleans are prefixed `is_` or `has_`.
- No `SELECT *` outside a staging model.
- Every model has a `description` in its YAML. A model nobody can describe is a model
  nobody should merge.

## Required tests

Every new model ships with, at minimum:

- `unique` and `not_null` on the primary key.
- `relationships` on every foreign key pointing at the referenced model.
- `accepted_values` on any column with a bounded domain.

## When reviewing

Report layering violations, missing tests, missing descriptions, and naming that departs
from the table above — each with the file and the model name. Do not rewrite the model
unless asked; report first.
