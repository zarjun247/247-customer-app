# AGENT_INSTRUCTIONS.md — Pharmacy OS Execution Doctrine

## Mandatory Reads Before Any Work
- docs/PRODUCT_NORTH_STAR.md
- docs/PHARMACY_OS_BLUEPRINT.md
- docs/OPERATIONS.md
- docs/COMPLIANCE.md
- docs/STATUS.md
- OPEN_BLOCKERS.md

Agents MUST read and align with these before making architectural or behavioral changes.

---

## Core System Principles (NON-NEGOTIABLE)

### 1. Pharmacist-Gated Dispensing
- No Rx / H / H1 / X medicine can be sold, packed, or delivered without pharmacist approval.
- AI must NEVER approve prescriptions.

---

### 2. One Order Truth
- App, WhatsApp, Counter, Admin must map to the SAME order and state machine.
- No parallel or shadow order systems allowed.

---

### 3. Stock Integrity
- No stock quantity mutation without a stock movement record.
- Batch-level tracking is mandatory.
- FEFO (First Expiry First Out) must be preserved.

---

### 4. Auditability
All sensitive actions must generate audit logs with:

- actorType
- actorId
- action
- entityType
- entityId
- beforeJson
- afterJson
- reason
- ipAddress / session / device (if available)
- sourceChannel (app / whatsapp / admin / system)
- createdAt

---

### 5. AI Boundary (STRICT)

AI is allowed:
- OCR
- parsing
- product matching
- anomaly detection
- suggestions
- summaries

AI is NOT allowed:
- prescription approval
- medicine substitution
- dosage decisions
- treatment advice
- dispensing decisions

---

## Engineering Rules

- Always extend existing modules instead of rewriting unnecessarily.
- Do not remove generated modules unless broken and replaced cleanly.
- Keep the system compiling at all times.

---

## Execution Rules (MANDATORY AFTER CHANGES)

Run and fix all issues:

- pnpm run check
- pnpm test
- pnpm run build

Do not leave errors unresolved.

---

## Git Workflow Rules

- NEVER push directly to main
- Always use branch + PR
- Clearly describe:
  - files changed
  - why changes were made
  - impact on system

---

## System Objective

This is NOT a generic e-commerce system.

This is:
Residential Medication Continuity Infrastructure.

The system must optimize for:
- deterministic execution
- compliance
- auditability
- SLA reliability
- high-density local fulfillment

---

## Decision Priority (when unclear)

1. Compliance
2. Stock correctness
3. Order correctness
4. Auditability
5. UX

---

## Operational Philosophy

- Prefer correctness over speed
- Prefer traceability over convenience
- Prefer explicit systems over implicit behavior

---

## Final Directive

Every change must strengthen:

- trust
- compliance
- determinism
- real-world operability

If a change weakens any of these, it must be rejected.
