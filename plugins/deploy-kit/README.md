# Deploy Kit

Prepares and verifies a backend service deployment.

## What it does

Runs a preflight checklist (green build, backward-compatible migrations, config, flags,
service dependencies), then produces a staged rollout plan with abort thresholds and an
explicit rollback plan including the point of no return.

It produces a plan. It does not execute the deployment.

## Install

```bash
claude plugin install deploy-kit@acme
```

Most backend engineers get it through the team pack instead:

```bash
claude plugin install pack-backend@acme
```

## Maintainers

Owned by `@acme/backend`.
