# MERGE_GOVERNANCE_V2

Canonical merge governance for Wave 0 / Prompt 1 as of 2026-05-08.

## Audit metadata

| Item | Value |
| --- | --- |
| Branch name | `chore/wave0-current-main-audit-v2` |
| Base SHA inspected | `2b28e7410d40f5a02d258dfcb80b51b51666ca02` |
| Validation results | `pnpm install` passed with warnings; `pnpm run check` passed; `pnpm test -- --runInBand` passed with MySQL integration skipped; `pnpm run build` passed with Vite warnings; `git diff --check` passed. |
| Governance scope | Control documentation only; no runtime, dependency, schema, or migration changes. |

## Non-negotiable merge rules

- Start all feature/hardening branches from latest protected `main`.
- Rebase before review if the branch is older than the current protected `main` SHA.
- Never merge stale duplicate branches raw.
- Never resolve conflicts by deleting newer main behavior, newer tests, newer safety checks, newer schema fields, newer provider fail-closed behavior, or newer lifecycle proof.
- Latest main wins by default unless the branch explicitly owns the changed domain and the reviewer intentionally accepts that diff.
- Do not merge docs/control PRs that change runtime behavior, package manifests, lockfiles, migrations, stock/payment/prescription/compliance logic, or provider connector behavior.
- Do not claim production readiness or 10/10 status without fresh current-main proof.

## Required PR evidence

Every PR must include:

1. Files changed.
2. Migrations added, or explicit `None`.
3. Runtime behavior changed, or explicit `None`.
4. Tests added/updated, or explicit `None` with rationale.
5. Validation results for:
   - `pnpm install`
   - `pnpm run check`
   - `pnpm test -- --runInBand`
   - `pnpm run build`
   - `git diff --check`
6. Stale PR / migration collision assessment if applicable.
7. Remaining risks and safe-to-merge assessment.


## Critical-file review gates

CODEOWNERS is the first review gate for high-risk pharmacy OS files, but it is not a substitute for domain proof. Any PR touching a protected critical-file pattern must name the domain reviewer and include the evidence below before merge:

- Migrations or `drizzle/schema.ts`: migration audit green, schema/migration consistency proof, migration numbering collision check, and rollback/forward-fix notes for destructive or risky changes.
- Stock, inventory, purchase, sale, or reservation files: stock invariant review plus DB proof that quantities, reservations, idempotency, and audit trails remain correct.
- Payment, refund, credit note, or webhook files: provider fail-closed review plus replay, idempotency, duplicate-webhook, and reconciliation evidence.
- Compliance, H1, prescription, regulated, or pharmacy/legal files: pharmacist/legal safety review, statutory-record evidence, and no bypass of prescription, consent, or regulated dispensing gates.
- Provider, storage, security, auth, privacy, middleware, or core server files: preserve fail-closed behavior, no-secret logging, no fake-success paths, explicit redaction, and least-privilege access.
- Admin routes, RBAC, or frontend route-security files: prove there is no route bypass, role downgrade, hidden admin exposure, or client-only authorization assumption.
- Workflows or scripts: governance/security scans must pass, and any CI change must not weaken required checks, placeholders, migration verification, or environment validation.

Do not claim code-owner enforcement is active unless GitHub branch protection or ruleset settings prove **Require review from Code Owners** is enabled for `main`.

## Stale PR merge policy

- #66 is treated as already merged by superseding PR #75 in local history; close original if still open.
- #68 should not be merged raw; later accounting/reconciliation/commercial lifecycle work exists.
- #76 and #80 require manual GitHub review because they are not visible in local merge history.
- Older duplicate barcode/payment/accounting/security PRs should be closed as superseded unless unique changes are rebuilt from latest main.

## Migration governance

- Only one branch may modify `drizzle/schema.ts` or add numbered Drizzle migrations at a time unless maintainers explicitly sequence them.
- Branches that add migrations must reserve/confirm the next migration number immediately before merge.
- Migration files must match the final `drizzle/schema.ts` state by static and DB lifecycle inspection.
- Destructive migrations require explicit backup/restore evidence, rollback/forward-fix instructions, and maintainer approval.
- Documentation/control branches must add no migrations.
- Open stale PRs touching migrations are high risk because current main already has migrations through `0044_index_performance_audit.sql` while metadata journal entries stop at `0021_oval_ultimatum`.

## Safe parallel domains

The following may run in parallel if they do not touch restricted files/domains and publish validation results:

| Domain | Safe boundaries |
| --- | --- |
| Docs/control | Markdown/status/runbook updates only. |
| Observability | Read-only health dashboards, logging docs, metrics proof; no auth/session or payment side effects without coordination. |
| Governance scans | Static guards, repository scans, proof docs; no runtime mutation. |
| DB test lifecycle | Test harnesses and isolated test DB proof; coordinate before changing migrations/schema. |
| Reservation lifecycle | Tests/docs may run; runtime reservation mutation requires restricted coordination. |
| Commercial lifecycle | Tests/docs may run; sale confirmation/payment/purchase commit changes are restricted. |
| Refill/continuity graph | Read-only or patient-continuity planning; must not bypass prescription/pharmacist gates. |
| AI read-only intelligence | OCR, parsing, suggestions, anomaly detection, summaries; no approvals, substitutions, dosage, or dispensing decisions. |
| Building intelligence | Building metadata, service-radius proof, routing analysis; no stock/payment mutation. |
| Deployment proof | Build/deploy/runbook/proof evidence; no feature implementation. |

## Restricted domains requiring coordination

Do **not** run parallel branches in these areas without explicit sequencing:

- `drizzle/schema.ts`
- Numbered Drizzle migrations and migration metadata
- `stockInvariant` / reservation mutation
- Payment lifecycle
- Sale confirmation
- Purchase commit
- H1 register creation
- Prescription vault access
- Provider connectors
- Auth/session middleware

## What was inspected

- Git history for latest local merge sequence.
- Existing governance/status documents.
- `package.json`, `.github/workflows/ci.yml`, and Drizzle migration layout.
- Validation command output.

## What was not verifiable

- Live GitHub branch protection and required status checks.
- Live PR review state, labels, checks, and conflicts.
- Production provider credentials, deployment environment, and real DB migration state.

## Next recommended prompts

1. GitHub branch-protection and stale-PR governance pass with authenticated tooling.
2. Migration metadata/journal reconciliation review.
3. Parallel wave kickoff using `PARALLEL_EXECUTION_CONTROL.md` as the domain ownership contract.
