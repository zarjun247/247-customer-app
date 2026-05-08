# FINAL_HARDENING_ROADMAP_STATUS

Canonical roadmap status for the next hardening waves as of 2026-05-08.

## Wave 0 — Current-main control and active gate cleanup

- Current main truth: create and maintain `CURRENT_MAIN_TRUTH.md` as the canonical readiness source until final merge-captain audit.
- Stale PR control: maintain `STALE_PR_STATUS.md` and close/rebase stale duplicate PRs only after GitHub-side confirmation.
- Resolve product-master runtime gates: keep PR `#66` active if still open; rebase and resolve conflicts separately rather than closing it as stale.

## Wave A — Proof layer hardening

- CI/security scan proof.
- MySQL test DB lifecycle.
- HTTP security middleware.
- Provider contract matrix.
- Observability healthchecks.
- Privacy/staff session controls.
- DB index audit.
- API abuse protection.

## Wave B — Core production lifecycle completion

- Atomic reservations.
- Reservation lifecycle completion.
- Canonical commercial lifecycle.
- Payment lifecycle/webhook completion.
- Pharmacy legal operations.
- Cold-chain, recall, and expiry controls.
- Store controls, maker-checker workflows, and offline behavior.
- Invoice PDF and credit-note runtime completion.

## Wave C — Operations, deployment, and proof dashboard

- Accounting event wiring.
- Real-store migration and UAT.
- Backup/restore/deployment proof.
- Staff SOP, training, and demo mode.
- Production proof dashboard.

## AI Wave — AI governance and assistant systems

- AI governance.
- Medication Continuity Graph.
- Refill Autopilot.
- Zero-stockout Procurement AI.
- Pharmacist Compliance Copilot.
- Building Health Index.
- Founder/Investor AI Command Center.

## Final — Merge-captain audit

- Run the final merge-captain audit after all accepted PRs merge.
- Confirm launch mode from current evidence, not stale docs.
- Publish final validation results, final stale-PR ledger, final migration/schema review, remaining risks, and safe-to-merge assessment.
