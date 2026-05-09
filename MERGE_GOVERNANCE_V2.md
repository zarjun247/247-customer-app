# MERGE_GOVERNANCE_V2


## 2026-05-09 critical-file ownership review gates

This branch adds `.github/CODEOWNERS` for high-risk Pharmacy OS files using `@zarjun247` as the temporary owner inferred from the repository path. The policy is governance-only and does not change runtime code, schema, migrations, package manifests, or lockfiles. GitHub enforcement still requires maintainers to enable **Require review from Code Owners** for `main` and prove that the configured owner has repository write/admin access.

PR #104 could not be inspected from this container because unauthenticated GitHub API/search access returned no public pull request data. Do not merge #104 blindly. Treat it as superseded by a latest-main rebuild unless authenticated review proves it is current, clean, docs/governance-only, conflict-free, and owner-valid.

### Mandatory review evidence by critical domain

Any PR touching migrations/schema must have:

- migration audit green;
- next reserved migration number from `MIGRATION_AUDIT_STATUS.md`;
- fresh/existing DB proof if possible;
- no duplicate migration prefix.

Any PR touching stock/reservation must have:

- stock invariant review;
- race/concurrency proof when mutation logic changes;
- no direct stock mutation outside the approved gateway.

Any PR touching payment/refund/webhook must have:

- fail-closed provider behavior;
- replay/idempotency proof;
- no fake success;
- no unverified paid/refunded state.

Any PR touching H1/Rx/compliance must have:

- pharmacist/legal review;
- no autonomous regulated release;
- H1 references preserved;
- doctor/pharmacist completeness preserved.

Any PR touching provider/storage/security/privacy/auth must have:

- no secret leaks;
- no bearer-spoof access;
- no unsafe storage access;
- no PII/medical data logs;
- no `provider_unconfigured` success state.

Any PR touching admin/frontend routes must have:

- no admin route bypass;
- RBAC guard proof;
- no direct rendering of restricted pages.

### CODEOWNERS-covered critical domains

- Migration/schema: `drizzle/*`, `drizzle/schema.ts`.
- CI/governance/scripts: `.github/workflows/*`, `scripts/*`, governance/migration/verify/release script patterns.
- Stock/reservation/inventory: stock invariant, stock, reservation, inventory, purchase, sales, and cart paths.
- Payment/refund/webhook: payment, refund, credit note, and webhook paths.
- Compliance/H1/Rx/legal: compliance, prescription, H1, regulated, and pharmacy paths.
- Provider/storage/security/privacy/auth: provider, storage, privacy, auth, middleware, core, health, abuse, and rate-limit paths.
- Accounting/commercial/Tally: commercial, accounting, tally, supplier, reports, and accounting router paths.
- Frontend route/security: routes, `App.tsx`, admin pages, and pharmacy pages.


## 2026-05-09 migration sequence collision rule update

- Latest migration collision surgery reserves `0049` as the next safe migration number after `0048_rbac_staff_session_governance.sql`.
- No parallel schema PR may merge without reading the latest `MIGRATION_AUDIT_STATUS.md` and re-running migration verification from current main.
- Open PRs adding old duplicate migration numbers (`0045`, `0046`, `0047`, or `0048`) must be rebuilt from latest main-equivalent history before review.
- PRs #94/#95/#96 style migrations must use the next available migration number after this fix (`0049` or later). Duplicated stale PRs must not merge raw.

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
- Do not claim dependency/security readiness unless `SUPPLY_CHAIN_SECURITY_AUDIT.md` is green or every high/critical finding has explicit owner-approved acceptance.
- Do not merge unreviewed dependency upgrades, package-manager changes, or lockfile rewrites inside unrelated runtime PRs.
- Do not allow package-manager drift in production: pnpm source of truth, CI setup, and lockfile evidence must agree before launch.
- Do not commit secrets in docs, tests, logs, fixtures, or env examples; secret scans must be green or accepted before launch.


## Branch-protection merge discipline addendum (2026-05-09)

This repository must treat branch protection as a hard merge gate, not as documentation-only guidance:

- No stale PR can merge. A branch is stale when it was not rebuilt or rebased after the latest protected `main` advanced in a relevant domain or after migration-number surgery.
- No conflicted PR can merge by accepting the old branch wholesale. Conflict resolution must preserve newer `main` behavior, tests, lifecycle proof, security controls, and migration order unless reviewers document why the PR owns that exact current domain.
- Latest `main` wins unless the PR owns the exact current domain and the reviewer intentionally accepts the branch diff over current `main`.
- No migration PR can merge without a green migration audit: duplicate migration-prefix scan, monotonic filename check, destructive-statement review, schema/migration consistency review, and DB lifecycle evidence where available.
- No PR can merge if it reintroduces any of these blocked regressions:
  - fake provider success or demo/stub/mock success treated as real production success;
  - direct stock mutation outside the invariant/reservation gateway;
  - H1/audit numeric coercion such as `Number(uuid)` or sentinel `entityId: 0`;
  - unguarded admin/pharmacy routes;
  - broad global body parser changes that can break webhook signature verification or request-specific parsers;
  - stale payment verification, stale webhook trust, or provider-unconfigured states treated as settled/verified;
  - stale product-master runtime gate removal;
  - stale privacy, consent, prescription-vault, or staff-session bypasses.
- Required branch protection settings and evidence live in `BRANCH_PROTECTION_ENFORCEMENT_STATUS.md`; do not claim GitHub enforcement is active until GitHub settings/API evidence confirms it.

## Required PR evidence

Every PR body must include these sections, with explicit `None` where a section does not apply:

1. Files changed.
2. Migrations added.
3. Runtime behavior changed.
4. Tests added/updated, with rationale if none were added.
5. Validation results for:
   - `pnpm install`
   - `pnpm run check`
   - `pnpm test -- --runInBand`
   - `pnpm run build`
   - `git diff --check`
   - plus domain-specific scans such as `pnpm run migrations:verify`, `node scripts/ci-governance-guards.mjs all`, release-gate, DB lifecycle, provider, stock, payment, privacy, or compliance checks when relevant.
6. Stale PR / migration collision assessment if applicable.
7. Remaining risks.
8. Safe-to-merge assessment.

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
- Open stale PRs touching migrations are high risk because current main-equivalent history now has migrations through `0048_rbac_staff_session_governance.sql` while metadata journal entries stop at `0021_oval_ultimatum`.

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

## Schema migration audit rule

Any PR touching `drizzle/schema.ts` or `drizzle/*.sql` must include migration audit proof and use the next reserved migration number from `MIGRATION_AUDIT_STATUS.md`.

## 2026-05-09 Open PR control-room pointers

- Use `OPEN_PR_CONTROL_ROOM.md` as the authoritative open-PR classification ledger before merging, closing, or rebuilding stale branches.
- Use `NEXT_REBUILD_QUEUE.md` for the approved execution order; stale branches must be rebuilt from latest main instead of merged raw.
- Use `OPEN_PR_CLOSURE_COMMENTS.md` for exact close/supersede/rebuild/migration-conflict comment templates.
