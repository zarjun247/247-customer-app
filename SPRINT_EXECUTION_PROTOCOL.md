SPRINT EXECUTION PROTOCOL

Purpose

This protocol defines a hands-off agent/engineer checklist and doctrine to finish the sprint/production-readiness-integration mega-sprint in a verifiable, non-fake manner.

A. Mission
- Controlled-production-ready Pharmacy OS.
- No stubs, placeholders, or fake-green assertions.
- No fake DB proof, provider success, email success, accounting/GST totals, or reports.
- All production claims must be backed by runnable, reproducible proofs or explicitly documented blockers.

B. Branch doctrine
- Continue work only on branch: sprint/production-readiness-integration.
- Do not create random branches; do not push directly to main.
- Only one mega-sprint active at a time.
- No parallel schema/migration branches or duplicate migration numbers.
- Before adding a migration: inspect drizzle/*.sql and the migration tail; increment next valid migration sequentially.

C. Required roadmap context (must be read and obeyed by agents)
- AGENTS.MD
- docs/PRODUCT_NORTH_STAR.md
- docs/PHARMACY_OS_BLUEPRINT.md
- docs/ADDITIONAL_FEATURES.md
- docs/ADDITIONAL_FEATURES_2.md (if present on this branch) OR GitHub issue #133 (if file lives on main)
- SPRINT_BASELINE_STATUS.md
- SPRINT_EXECUTION_PROTOCOL.md (this document)

D. Final production target (controlled-production-pilot ready)
- All check/test/build commands pass.
- Migration verifier passes with no duplicate or missing migration tail.
- Governance scanner (scripts/ci-governance-guards.mjs) passes relevant checks.
- No fake provider/OCR/storage/email/accounting success — integrations either pass real checks or report not_configured/manual_required.
- Stock/order/payment/reporting truths reconcile to canonical events.
- Pharmacist gating for Rx/H/H1/X flows is intact and enforced.
- Accounting/GST/export packs trace to source events or clearly documented as incomplete.
- DB concurrency proof is green OR the blocker is explicitly documented and triaged.
- No P0 blockers remain.

E. Mega-sprint order (authoritative)
1. Baseline lock
2. Environment + roadmap memory lock
3. No fake success cleanup
4. Observability + healthchecks + redaction
5. Provider runtime + reservation lifecycle truth
6. Accounting/reporting/email packs/GST-IT export readiness
7. DB proof + reconciliation proof
8. Pharmacy legal ops + offline/manual fallback
9. Final release gate + controlled pilot signoff

F. Accounting/GST/email pack requirements (summary)
- Daily purchase & sales reports with SKU/batch/HSN/GST splits and trace to source purchase/sales/invoice records.
- Cash drawer reports: opening/closing/variance, staff/cashier refs, approval-required exceptions.
- Weekly accounts email pack (CSV/XLSX/PDF) with daily summaries and exception lists; if email provider unconfigured, export pack must still generate and provider state must be marked not_configured/manual_required.
- Monthly/quarterly/yearly statutory packs: purchase register, sales register, GST input/output, HSN summaries, supplier outstanding, stock valuation, credit/debit notes, refunds/returns, Tally compatibility where supported.
- No synthetic totals; all numbers must trace to canonical events (invoices, stock movements, payments, returns, credit/debit notes).
- Missing statutory master data surfaced as exceptions, not silently ignored.
(See issue #133 and docs/ADDITIONAL_FEATURES_2.md on main for full spec.)

G. Validation commands (mandatory per sprint)
Run in workspace root in order:
- pnpm install
- pnpm run check
- pnpm test -- --runInBand
- pnpm run build
- node scripts/verify-migrations.mjs
- node scripts/ci-governance-guards.mjs all
- git diff --check
If dependencies changed: pnpm audit
If DB-proof relevant and TEST_DATABASE_URL exists: run DB smoke/concurrency scripts from package.json (test:db:bootstrap/test:db:smoke/test:db:concurrency).
Skipped DB tests are NOT proof.

H. Environment setup rules
- Do not silently install random Node/pnpm versions. Respect package.json -> packageManager field.
- If Node/pnpm missing, document exact installation commands for Windows and recommend exact versions derived from packageManager.
- If installing in this environment, install Node LTS and enable corepack, then set pnpm to the packageManager version.

I. Commit rules
- Only commit docs or small baseline pointer updates for this procedure (SPRINT_EXECUTION_PROTOCOL.md and short SPRINT_BASELINE_STATUS.md pointer updates are allowed).
- No runtime code changes, no migrations, no package.json modification unless required for tooling compatibility and explicitly approved.

J. Execution guidance for agents
- Always run the validation commands after environment is ready.
- If Node/pnpm cannot run locally, document the blocker exactly and do not claim green.
- When adding new roadmap items (accounting/GST etc.), reference issue #133 and docs/ADDITIONAL_FEATURES_2.md (on main) and include them in sprint planning but do not implement as part of this docs change.

K. Short checklist for PR readiness
- Branch: sprint/production-readiness-integration
- Tests: all passing locally and in CI
- Migrations: verified (scripts/verify-migrations.mjs)
- Governance: scripts/ci-governance-guards.mjs all pass
- DB proof: concurrency tests passed or blocker documented and triaged
- Accounting/report pack: generates export or clearly marked as provider-not-configured
- No fake success claims in code, runtime or CI

End of protocol.
