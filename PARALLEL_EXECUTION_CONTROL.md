# PARALLEL_EXECUTION_CONTROL


## 2026-05-09 CODEOWNERS/review-gate parallel-safety update

- `chore/critical-file-ownership-codeowners-review-gates` is governance-only and parallel-safe because it adds ownership metadata and documentation without touching runtime code, client runtime files, package manifests, lockfiles, `drizzle/schema.ts`, or migration SQL.
- CODEOWNERS/review-gate work does **not** unlock runtime/schema work.
- Schema/runtime rebuilds remain locked until latest-main validation is green and the restricted-domain sequencing rules below are satisfied.
- Future PRs must respect CODEOWNERS domains once branch protection enables owner review on `main`.
- Code Owner review is not a substitute for domain proof: migration, stock, payment, H1/Rx/compliance, provider/security/privacy/auth, and admin/frontend route PRs still need the evidence required by `MERGE_GOVERNANCE_V2.md`.
- PR #104 was not publicly inspectable from this container; do not merge it blindly in parallel with this branch. Rebuild/supersede it unless authenticated review proves it is current, clean, governance-only, and owner-valid.


## 2026-05-09 schema parallelism stop-rule update

- Numbered Drizzle migrations are in restricted single-writer mode after the collision surgery on `fix/migration-sequence-collision-surgery`.
- Every schema/migration PR must read `MIGRATION_AUDIT_STATUS.md`, rebuild from latest main-equivalent history, and reserve `0049` or later before merge.
- Open PRs using stale duplicate migration numbers must be rebuilt; PRs #94/#95/#96 style migrations must not merge if they still contain old `0045`/`0046`-era filenames.
- Duplicated stale schema PRs must not merge raw, even if their runtime code appears conflict-free.

Parallel execution control contract for Wave 0 / Prompt 1 as of 2026-05-08.

## Audit metadata

| Item | Value |
| --- | --- |
| Branch name | `chore/wave0-current-main-audit-v2` |
| Base SHA inspected | `2b28e7410d40f5a02d258dfcb80b51b51666ca02` |
| Validation results | `pnpm install` passed with warnings; `pnpm run check` passed; `pnpm test -- --runInBand` passed with MySQL integration skipped; `pnpm run build` passed with Vite warnings; `git diff --check` passed. |
| Purpose | Prevent parallel Codex branches from colliding in schema, inventory, payment, prescription, compliance, provider, and auth/session domains. |


## Current P0 sequencing rules after migration-collision discovery (2026-05-09)

- Migration-number collision surgery is P0 and must merge before any schema or migration PR.
- Branch protection proof must be completed and manually verified before multi-store/race-mode production claims or production rollout.
- Docs-only PRs may run in parallel only when they do not modify runtime files, package manifests, lockfiles, schema, or migration SQL.
- Schema PRs must pause until migration numbering is clean and the next migration number is reserved from `MIGRATION_AUDIT_STATUS.md`.
- Runtime PRs touching the same domain must not run in parallel; one owner must sequence stock, payment, purchase, sales, prescription, compliance, auth/session, provider, and worker domains.
- Current open PRs #94/#95/#96 likely require rebuild after migration surgery if they use stale migration prefixes such as old duplicate `0045`/`0046`.
- Current open PRs #88/#89/#90/#91 require explicit rebase/salvage decisions before merge because stale branches must not land by accepting old branch state wholesale.
- Old PRs #2–#11/#19/#44/#46/#47/#62/#66/#68/#76/#80/#86 should not merge directly. If any contain unique value, rebuild only the needed diff from latest protected `main`.
- A PR that touches `drizzle/schema.ts`, `drizzle/*.sql`, Drizzle metadata, stock invariant gateways, payment lifecycle, prescription/privacy controls, admin/RBAC routes, provider connectors, or CI/governance scans must declare its restricted domain and wait for explicit sequencing.

## Safe parallel domains

These domains may run in parallel when each branch stays inside its boundaries, cites changed files, and runs required validation.

| Domain | Allowed work | Hard boundary |
| --- | --- | --- |
| Docs/control | Status docs, governance docs, runbooks, audit summaries. | No runtime behavior, package, lockfile, migration, or schema changes. |
| Observability | Healthcheck proof, metrics docs, logging dashboards, alert runbooks, static observability tests. | Coordinate before touching auth/session middleware, provider calls, payment flows, or stock mutations. |
| Governance scans | Static guards, dependency/license/security scans, placeholder scans, CI proof docs, and supply-chain/secret-hygiene audit docs. | No app behavior changes unless separately approved; no unreviewed dependency upgrades, package-manager changes, lockfile rewrites, or fake-green security claims. |
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

## Schema PR Freeze

- No schema PR may merge until migration surgery and latest-main validation are complete.
- Docs/governance-only prompts may continue if they do not claim migration repair or production readiness.
- Runtime-only PRs that do not touch schema may proceed only after explicit review confirms no `drizzle/schema.ts` or `drizzle/*.sql` changes.
- Open PRs with stale migration numbers must be rebuilt, not merged.

## Supply-chain parallel execution rule (2026-05-09)

- Dependency/security audit work may run in parallel only when it stays docs/report focused or uses a dedicated dependency-fix branch.
- High/critical dependency findings must be green or explicitly accepted before launch; CI should eventually block unresolved high/critical supply-chain findings.
- Package-manager drift is a restricted production-readiness issue: do not change pnpm, Node, package manifests, or lockfiles from unrelated runtime branches.
- Secret hygiene applies to every branch: do not add real secrets to docs, logs, tests, fixtures, screenshots, or env examples.

## Stale PR control lane (2026-05-09)

- Stale PR control is parallel-safe only when it changes documentation/GitHub metadata and does not modify runtime code, client runtime files, server services/routers, `drizzle/schema.ts`, `drizzle/*.sql`, migrations, package manifests, or lockfiles.
- Schema/runtime rebuilds must start from latest authenticated `main`; old branches may be used only as reference material.
- PR #114 (provider runtime) and PR #115 (reservation lifecycle) cannot both use the same migration number. If both require migrations, one must land first and the other must reserve the next free number after rebasing.
- Provider runtime and reservation lifecycle rebuilds must be sequential when both require migrations; do not parallel-merge migration-bearing versions of those domains.
