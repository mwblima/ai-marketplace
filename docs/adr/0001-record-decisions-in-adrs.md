# ADR-0001 — Record decisions in ADRs

- **Status:** Accepted
- **Date:** 2026-08-12

## Context

The goal of this project is not only to build an internal marketplace. It is to produce a
**reusable governance model** that other companies can fork, and that will serve as the
basis for an article. A model like that is worth less for its code than for its reasoning:
whoever adopts it needs to understand *why* each piece exists in order to decide whether it
applies to their context.

Decisions made in conversation or buried in commits are lost. Without a trail, an external
adopter cannot tell what is essential to the pattern from what is a local accident.

## Decision

Every structural decision is recorded as an ADR under `docs/adr/`, numbered sequentially,
in the format **Context → Decision → Consequences → Alternatives considered**.

Rules:

1. An accepted ADR is immutable. A change of direction creates a new ADR that supersedes it.
2. Any PR that changes structure (schema, directory layout, pipeline, artifact format)
   references the ADR that authorizes it. If no ADR exists, the PR opens one.
3. The index in `docs/adr/README.md` is the entry point for anyone adopting the model.
4. **Everything is written in English** — ADRs, documentation, code, schemas, CI messages,
   and site copy. The model is meant to be forked by companies whose working language we
   cannot assume, and mixed-language repositories decay into the worst of both.

## Consequences

- The article is largely a guided reading of the ADRs, which lowers the cost of writing it.
- Adopters can reverse decisions deliberately rather than through commit archaeology.
- Cost: discipline. A structural PR without an ADR has to be blocked in review, otherwise
  the log rots within weeks.

## Alternatives considered

- **A single living architecture document** — rejected: it loses the history of why
  something changed, which is precisely what an adopter needs.
- **The README alone** — rejected: it mixes "how to use" with "why it is like this", and
  the second one is the actual product here.
