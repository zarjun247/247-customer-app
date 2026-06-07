# ADR-0008: AI features are assistive-only — no regulated mutation authority

## Status

Accepted — implemented in SM-B / SM-E, 2026-05.

---

## Context

The system includes AI/ML features: stockout forecasts, refill reminders, intelligence dashboards, and OCR-assisted prescription ingestion. All of these have the potential to influence clinical or commercial decisions.

Indian pharmacy regulations (Drugs and Cosmetics Act) require a licensed pharmacist to verify and approve every prescription before dispensing. If an AI system were permitted to approve prescriptions, generate purchase orders autonomously, or modify patient records without a human in the loop, this would violate the statutory requirement and expose the operator to criminal liability.

---

## Decision

All AI features are constrained to **assistive-only** mode:

1. **No AI procedure may perform a regulated mutation** (prescription approval, medicine dispensing, H1/H/X drug release). The `aiGovernance.ts` service (sealed file) enforces this via `assertPhaseAtLeast` guards.
2. AI suggestions are written to `ai_eval_ledger` as advisory records only. They require human acceptance before any state change.
3. All 12 intelligence procedures are phase-gated: they return an error until the deployment reaches `"scaled"` phase. This prevents AI features from being accidentally activated in a staging environment where the full pharmacist workflow is not yet operational.
4. The `PhaseGate` React component on the frontend refuses to render AI UI elements if the phase is below the required threshold.

Any change to this constraint requires a legal and compliance review sign-off (documented in OPEN_BLOCKERS.md).

---

## Consequences

### Positive

- Clear regulatory compliance: no prescription can be dispensed without a pharmacist interaction.
- The `aiGovernance.ts` sealed-file protection means these constraints cannot be weakened without a deliberate code change reviewed in a PR.

### Negative

- AI features cannot be used to accelerate the pharmacist workflow directly (e.g., auto-approve low-risk refills) without a regulatory review.
- Phase-gating delays AI availability until the deployment reaches `scaled` phase, which requires manual progression.
