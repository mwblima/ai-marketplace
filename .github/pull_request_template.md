<!--
CI covers the mechanical checks (ADR-0007, layers 1 and 2). This template covers layer 3:
the judgment that a script cannot make. Fill in the verdict block for any PR that adds or
changes an artifact. Documentation-only PRs can delete everything below.
-->

## What this changes

<!-- One or two sentences. If this adds an artifact, say what problem it solves. -->

## ADR

<!-- Structural PRs (schema, layout, pipeline, artifact format) must reference the ADR that
     authorizes them. If none exists, open one first — see docs/adr/README.md. -->

Relates to ADR-XXXX.

## Policy verdict

Reviewed against `.github/policy/prompt.md`. Verdict shape is `.github/policy/schema.json`.

```json
{
  "passes": true,
  "summary": "",
  "violations": "",
  "hooks": [],
  "may_make_external_network_calls": false,
  "may_download_additional_software": false,
  "has_broad_scope_hooks": false,
  "has_undisclosed_telemetry": false,
  "description_matches_behavior": true,
  "data_classification_accurate": true,
  "is_atomic": true,
  "reviewer": "@your-handle"
}
```

## Author checklist

- [ ] `npm run ci` passes locally.
- [ ] The description says **when to use** the artifact, in the words someone would search
      for. It is both the search field and the model's activation trigger (ADR-0006).
- [ ] The artifact does **one** thing. If the description needs "and" to list distinct
      jobs, it is two artifacts (ADR-0007).
- [ ] `owner_team` is a team that can be paged about this, and it appears in `CODEOWNERS`.
- [ ] Logic is expressed as a skill where possible. A skill is portable across all three
      tools and opt-in; a hook runs in one tool, globally, and invisibly (ADR-0004).
- [ ] If `version` changed, a release tag will be pushed after merge:
      `claude plugin tag --push` (ADR-0010).
