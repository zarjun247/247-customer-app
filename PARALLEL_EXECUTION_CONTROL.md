# PARALLEL_EXECUTION_CONTROL

Parallel execution control contract for Wave 0 / Prompt 1 as of 2026-05-08.

## Audit metadata

| Item | Value |
| --- | --- |
| Branch name | `chore/wave0-current-main-audit-v2` |
| Base SHA inspected | `2b28e7410d40f5a02d258dfcb80b51b51666ca02` |
| Validation results | `pnpm install` passed with warnings; `pnpm run check` passed; `pnpm test -- --runInBand` passed with MySQL integration skipped; `pnpm run build` passed with Vite warnings; `git diff --check` passed. |
| Purpose | Prevent parallel Codex branches from colliding in schema, inventory, payment, prescription, compliance, provider, and auth/session domains. |

## Safe parallel domains

These domains may run in parallel when each branch stays inside its boundaries, cites changed files, and runs required validation.

| Domain | Allowed work | Hard boundary |
| --- | --- | --- |
| Docs/control | Status docs, governance docs, runbooks, audit summaries. | No runtime behavior, package, lockfile, migration, or schema changes. |
| Observability | Healthcheck proof, metrics docs, logging dashboards, alert runbooks, static observability tests. | Coordinate before touching auth/session middleware, provider calls, payment flows, or stock mutations. |
| Governance scans | Static guards, dependency/license/security scans, placeholder scans, CI proof docs. | No app behavior changes unless separately approved. |
| DB test lifecycle | Test DB bootstrap proof, isolated MySQL smoke tests, CI service proof. | Do not change migrations/schema without migration owner coordination. |
| Reservation lifecycle | Read-only audits, tests, lifecycle documentation. | Reservation mutation and `stockInvariant` changes are restricted. |
| Commercial lifecycle | Read-only audits, tests, proof around invoices/refunds/credit notes/journals. | Sale confirmation, payment lifecycle, and purchase commit are restricted. |
| Refill/continuity graph | Refill plans, continuity analysis, reminder proof, patient graph docs/tests. | Must not bypass prescription, consent, pharmacist, or privacy gates. |
| AI read-only intelligence | OCR, parsing, product matching, anomaly detection, suggestions, summaries, reviewer queues. | AI must not approve prescriptions, substitute medicines, set dosage, make treatment advice, or authorize dispensing. |
| Building intelligence | Buildings, service-radius analysis, routing proof, density/SLA planning. | No stock/payment/prescription mutation without domain owner approval. |
| Deployment proof | Build proof, environment checklist, smoke-test runbook, backup/restore evidence, rollback docs. | No feature implementation hidden inside deployment proof. |

## Restricted domains requiring explicit sequencing

Only one active branch should own each domain at a time. A maintainer must sequence, rebase, and review these carefully:

- `drizzle/schema.ts`
- Numbered Drizzle migrations and Drizzle metadata
- `stockInvariant` / reservation mutation
- Payment lifecycle
- Sale confirmation
- Purchase commit
- H1 register creation
- Prescription vault access
- Provider connectors
- Auth/session middleware

## Schema PR Freeze

- No schema PR may merge until migration surgery plus latest-main validation are complete.
- Docs/governance-only prompts may continue if they do not touch runtime code, package files, schema, or migrations.
- Runtime-only PRs that do not touch schema may proceed only after explicit changed-files review.
- Open PRs with stale migration numbers must be rebuilt, not merged.

## Coordination checklist for restricted work

Before starting restricted work:

1. Confirm latest protected `main` SHA from GitHub.
2. Check open PRs for overlapping files/domains.
3. Reserve the domain owner in the PR description.
4. If migrations are needed, reserve/confirm the next migration number immediately before merge.
5. Add or update tests for the exact domain behavior.
6. Run `pnpm install`, `pnpm run check`, `pnpm test -- --runInBand`, `pnpm run build`, and `git diff --check`.
7. Rebase again immediately before review if main advanced.

## Conflict resolution rules

- Prefer current main during conflicts unless the branch intentionally owns the conflicting domain.
- Do not delete newer tests or safety guards to make a stale branch compile.
- Do not merge a stale PR raw when current main has advanced through security, privacy, inventory, payment, accounting, or migration changes.
- If conflict resolution is complex, close the stale branch and rebuild only the unique change from latest main.

## What was inspected

- Local git merge history through PR #83.
- Existing control/status documentation.
- Package scripts, CI workflows, migration layout, and validation command output.

## What was not verifiable

- Live GitHub open PR state and branch protection.
- Which agents/prompts are currently active outside this container.
- Live production/staging environment status.

## Next recommended prompts

1. Assign parallel wave prompts only after each prompt declares its domain and restricted-file status.
2. Run a GitHub-side active PR overlap scan before any restricted-domain PR is reviewed.
3. Run a final merge-captain audit after all parallel waves complete.
