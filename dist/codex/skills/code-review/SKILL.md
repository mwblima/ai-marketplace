---
name: code-review
description: Review a pull request or working-tree diff against the company engineering
  standards, reporting correctness bugs, missing tests, and security issues with file and
  line references. Use before requesting human review on any change.
---

# Code review

Review changed code and report defects. Findings only — do not restate what the change does.

## Scope

Review the diff, not the repository. A pre-existing problem in an untouched file is out of
scope unless the change makes it reachable or materially worse.

Determine the diff in this order:

1. An explicit target given by the user (a PR number, a branch, a path).
2. Otherwise `git diff` against the merge base with the default branch.
3. If the working tree is clean and no target was given, say so and stop.

## What to report

Report a finding only when you can name the concrete failure: the input or state that
triggers it, and the wrong result it produces. "This could be risky" is not a finding.

In priority order:

1. **Correctness** — logic that produces a wrong result, unhandled error paths, race
   conditions, off-by-one and boundary errors, incorrect null handling.
2. **Security** — injection reachable from user input, missing authorization checks,
   secrets in source, unsafe deserialization, permissive CORS or auth bypass.
3. **Data** — migrations that are not backward compatible, queries without bounds,
   N+1 access patterns on a request path.
4. **Test coverage** — a behavior change with no test that would fail without the fix.
5. **Simplification** — duplicated logic that an existing utility already covers.

## What not to report

- Formatting, import order, or anything the linter and formatter already enforce.
- Stylistic preferences that the codebase does not consistently follow.
- Speculative performance concerns with no measurement and no hot path.
- Requests to add comments to self-explanatory code.

## Output

Group findings by severity, most severe first. For each one:

```
<file>:<line> — <one-sentence statement of the defect>
  Failure: <the input or state, and the wrong outcome it produces>
  Fix: <the smallest change that resolves it>
```

Close with a one-line verdict: `Ready to merge`, `Ready with minor comments`, or
`Needs changes`. If there are no findings, say so in one line and stop — do not pad the
review with observations to appear thorough.
