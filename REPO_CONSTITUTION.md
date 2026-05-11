# 24/7 Pharmacy OS Repository Constitution

This document defines the canonical architecture laws for the 24/7 Pharmacy OS repository. These laws are binding for all agents, contributors, services, migrations, validations, and pull requests.

## 1. No Parallel Truth Systems

The platform must not introduce or maintain parallel systems of truth for the same business fact.

- A domain fact must have one canonical source and one canonical mutation path.
- Read models, caches, projections, analytics tables, logs, AI summaries, and dashboards may mirror canonical truth, but they must not become competing authorities.
- Any duplicated representation must be derived, reconcilable, and traceable back to its canonical source.
- If two systems disagree, the canonical source wins and the discrepancy must be treated as an operational defect.

## 2. Stock Mutation Canonical Law

`stockInvariant` is the canonical authority for stock mutation.

- All stock-affecting operations must pass through `stockInvariant`.
- No feature, worker, migration, script, endpoint, administrative screen, AI workflow, or integration may mutate stock outside this invariant.
- Reservation, deduction, release, reversal, reconciliation, and adjustment flows must preserve the invariant and its auditability.
- Any proposed stock pathway that bypasses `stockInvariant` is invalid architecture and must be rejected before merge.

## 3. Commercial Truth Seam Canonical Law

Commercial truth seams are canonical for order, payment, refund, and accounting state.

- Order state must be created, transitioned, and reconciled only through the canonical order truth seam.
- Payment state must be created, transitioned, and reconciled only through the canonical payment truth seam.
- Refund state must be created, transitioned, and reconciled only through the canonical refund truth seam.
- Accounting state must be created, transitioned, and reconciled only through the canonical accounting truth seam.
- Integrations, ledgers, reconciliation jobs, dashboards, exports, support tools, and AI summaries must consume or derive from these seams rather than inventing alternate commercial truth.

## 4. Clinical and Dispensing Gate Law

H, H1, and pharmacist gates cannot be bypassed.

- Any workflow involving restricted medicine, regulated dispensing, prescription verification, substitution, release, or handoff must enforce the required H, H1, and pharmacist gates.
- UI controls, backend APIs, background jobs, support overrides, scripts, migrations, integrations, and AI tools must not skip or weaken these gates.
- Gate decisions must be explicit, auditable, and attributable.
- A blocked clinical or dispensing gate must fail closed, not proceed optimistically.

## 5. AI Boundary Law

AI is operational-only and must never perform clinical judgment or autonomous dispensing.

- AI may assist with operational summaries, queue prioritization, customer-support drafting, anomaly surfacing, workflow routing, and documentation support.
- AI must not diagnose, prescribe, recommend clinical treatment, approve restricted dispensing, override pharmacist judgment, or autonomously release medicine.
- AI output must not be treated as canonical clinical, commercial, inventory, payment, refund, or accounting truth.
- Any AI-assisted workflow that touches regulated or clinical decisions must keep a qualified human decision-maker in control.

## 6. Observability Truth Law

Observability cannot create fake truth.

- Logs, metrics, traces, analytics, dashboards, alerts, and AI observability summaries must reflect actual system events and canonical state.
- Observability tooling must not fabricate successful orders, payments, refunds, stock mutations, pharmacist approvals, migrations, validations, or remediations.
- Synthetic checks and test events must be clearly marked as synthetic and isolated from production truth.
- Monitoring may reveal truth, but it must not become an alternate source of truth.

## 7. Migration Law

Migrations must be sequential and non-destructive.

- Migrations must be ordered, deterministic, reviewable, and safe to apply in sequence.
- Migrations must preserve existing production data unless an explicitly reviewed and approved data-retention or correction plan says otherwise.
- Destructive schema or data changes must use staged, reversible-safe rollout patterns whenever possible.
- Backfills and data corrections must be auditable, idempotent where practical, and tied to canonical truth seams.

## 8. Branch and Pull Request Law

All agents must branch from latest `main` and create pull requests.

- Work must begin from the latest available `main` branch state.
- Changes must be made on a feature, fix, chore, or agent branch rather than directly on `main`.
- Every repository change must be proposed through a pull request with a clear title, summary, and validation record.
- Pull requests must call out any architecture-law implications, especially around stock, commercial truth, clinical gates, AI boundaries, observability, and migrations.

## 9. Main Branch Protection Law

No direct push to `main` is permitted.

- `main` is an integration branch and must be protected from direct human, agent, automation, and emergency pushes.
- Emergency production fixes must still use a branch, validation, review, and pull request path unless an explicitly documented incident process allows otherwise.
- If a direct push to `main` is detected, it must be treated as a process violation and remediated with audit notes.

## 10. Validation Before Pull Request Law

Validation commands are required before creating a pull request.

- Contributors and agents must run the repository-required validation commands before opening a pull request.
- The pull request body must list the exact validation commands run and their outcomes.
- Failed validations must either be fixed before PR creation or explicitly documented with the reason, impact, and follow-up owner.
- Validation must be real: fabricated command output, skipped checks reported as passing, or observability-only proof without execution is prohibited.

## 11. Conflict Resolution

When implementation choices conflict with this constitution, this constitution prevails unless it is amended through an explicit pull request.

- New features must adapt to canonical laws rather than creating exceptions by default.
- Exceptions require documented rationale, risk assessment, validation, and approval.
- Temporary exceptions must include an owner and removal plan.
