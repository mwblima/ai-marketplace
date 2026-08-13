# ADR-0008 — Static site on GitHub Pages, no framework

- **Status:** Proposed
- **Date:** 2026-08-12

## Context

The official Anthropic pattern has no discovery interface: you browse plugins inside the CLI
(`/plugin > Discover`) or read a 4,000-line JSON file. For corporate use that is not enough —
the person deciding whether to adopt an artifact often does not have a terminal open, and a
link to a page is what circulates in chat, wikis, and onboarding docs.

The interface must be browsable, searchable (ADR-0006), and hosted alongside the repository,
with no infrastructure to maintain.

## Decision

A static site under `docs/`, published to GitHub Pages via `actions/deploy-pages`, with
**no framework and no bundling step**: `index.html`, `app.js`, `style.css`, and a
`data/index.json` produced by the build.

- No React, no Vite, no `npm install` to render. `app.js` fetches the index and renders the
  list. It fits in a few hundred lines.
- v1 features: search, facet filters, an artifact card showing owner and maturity, a detail
  panel with governance metadata, and a copy button for the install command
  (`claude plugin install <name>@<marketplace>`; symlink instructions for Codex and Cursor).
- The detail panel **links** to the artifact's README in the repository rather than rendering
  it. Rendering Markdown would mean shipping a Markdown parser, which is the first dependency
  and the first build step — the two things this ADR exists to avoid. Revisit only if
  measurement shows people are not following the link.
- Packs (ADR-0005) get distinct styling and list what they install.
- The site is generated in CI from the catalog. Nobody ever edits HTML to add a plugin.

Refusing a framework follows directly from the project's goal: the model must be adoptable by
another company in an afternoon. A site with no build step does not break on a Node version
bump, has no dependencies to audit, and still works in three years untouched.

## Consequences

- Zero operational cost and a minimal attack surface.
- No SSR, so content is not indexed by external search engines — irrelevant for an internal
  catalog.
- The absence of a framework charges rent as the page grows: if it accumulates a lot of state,
  plain JS gets uncomfortable. Accepted; if it happens, that is a new ADR.

### Public reference repository vs. private corporate deployment

This reference repository is **public**, so GitHub Pages works on the free tier with no
caveats and the published site is world-readable. That is intended: the model is meant to be
read.

An adopting company will run this **private**, because the catalog exposes internal team
names, tooling, and workflows. Hosting then changes, and the adoption guide must say so:

| Option | Requirement | Notes |
|---|---|---|
| GitHub Pages with private visibility | GitHub Enterprise Cloud | Access limited to org members. The direct equivalent of this setup. |
| GitHub Pages, public site from a private repo | Any plan | **Do not do this by default.** The repo stays private but the published catalog is world-readable, which leaks exactly the internal information that motivated going private. |
| Internal static host (S3 + internal ALB, nginx, internal Pages) | Existing infrastructure | The build output is a plain directory; any static host serves it. |
| No site at all | — | The CLI still works fully. The site is a discovery layer, not a dependency. |

The build must therefore emit a self-contained `docs/` directory with **relative paths only**,
so the same output can be served from any host and any base path without reconfiguration.
Verify the hosting option before running the site phase.

## Alternatives considered

- **Docusaurus / Astro / VitePress** — rejected: attractive, but brings `node_modules`, a
  build step, and version maintenance to render a searchable list.
- **The repository README alone** — rejected: no search, no filters, and the
  search-by-description requirement is explicit.
- **Backstage (software catalog)** — rejected: it solves the problem but requires running and
  operating a service, which directly contradicts "simple and extensible".
