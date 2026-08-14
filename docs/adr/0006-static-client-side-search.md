# ADR-0006 — Name and description search via a static client-side index

- **Status:** Accepted
- **Date:** 2026-08-12

## Context

Requirement: search artifacts by name **and** by words in the short description. Without it,
a catalog beyond ~30 items becomes a list nobody reads, and governance fails for the most
mundane reason — people cannot find what exists and rewrite it from scratch.

The hard constraint comes from ADR-0008: the site is static on GitHub Pages, with no backend.
There is nowhere to run a search service.

## Decision

Fully client-side search over a pre-generated index.

- The build emits `docs/data/index.json` with one record per artifact: `name`, `displayName`,
  `description`, `category`, `owner_team`, `scope`, `maturity`, `tools`, `keywords`, and the
  artifact type (`skill`, `agent`, `mcp`, `hook`, `command`, `pack`).
- Search matches over `name` + `description` + `keywords` + `owner_team`, using
  case- and accent-insensitive substring matching, tokenizing the query on whitespace and
  requiring **every** term to match some field (AND across terms, OR across fields).
- Ranking is simple and explainable: exact `name` match > `name` prefix > `name` substring >
  `keywords` match > `description` match. No fuzzy matching in v1 — a wrong result that looks
  right is worse than no result.
- Composable facet filters (category, team, tool, maturity) applied on top of the search
  result set.
- Implemented in plain JavaScript, with no search library dependency.

The limit of this decision is known: above roughly 2,000 artifacts, loading the whole index
client-side stops being reasonable. For a realistic corporate catalog (dozens to a few
hundred), the index is tens of kilobytes and search is instant. Revisit with a new ADR past
1,000 entries.

**The description is a search field, not decoration.** That has a governance consequence
captured as a guideline in ADR-0007: `description` must state *when to use* the artifact,
using the words a person would actually type. It is the same text the model uses to decide
whether to trigger the skill, so optimizing it serves human search and automatic activation
at once.

## Consequences

- Zero infrastructure, zero cost, and the site keeps working offline once loaded.
- The index is a versioned artifact: catalog changes are diffable in a PR.
- Without stemming, searching "deploys" will not find "deploy". Mitigation: a `keywords`
  field in the catalog for synonyms and plurals that matter.
- The same `index.json` doubles as a de facto API for anyone building another interface.

## Alternatives considered

- **Lunr.js / FlexSearch** — rejected for v1: adds a dependency and a build step for marginal
  gain at this volume. Natural upgrade if the catalog grows.
- **GitHub code search / GitHub API** — rejected: requires authentication, has rate limits,
  and fails exactly in the private-repository case that adopters will run.
- **Server-side search** — rejected: contradicts ADR-0008 and turns the model into something
  another company cannot adopt in an afternoon.
