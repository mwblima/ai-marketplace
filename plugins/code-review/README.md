# Code Review

Reviews a pull request or working-tree diff against the company engineering standards.

## What it does

Reports correctness bugs, security issues, data-layer problems, missing test coverage, and
duplicated logic — each with a file and line reference and a concrete failure scenario.
It deliberately does not report formatting or style, which the linter already enforces.

## Install

```bash
claude plugin install code-review@acme
```

Codex and Cursor: see [Installing on Codex and Cursor](../../docs/adoption/other-tools.md).

## Usage

Ask for a review in natural language, or point it at a target:

```
review my changes
review PR 482
review the diff against main
```

## Maintainers

Owned by `@acme/platform`. Open an issue or a PR against `catalog/company/code-review.yaml`
and `plugins/code-review/`.
