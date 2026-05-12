# Pharmacist Daily / Weekly SOP

This template defines the minimum set of tasks a licensed pharmacist must complete each shift. It does not replace professional judgement, jurisdictional requirements, or pharmacist-in-charge authority. Print a copy and keep it at the dispensing counter.

See also: [OPERATIONS.md](../docs/OPERATIONS.md) §Pharmacist operations.

---

## Daily tasks — every shift

### Opening (before first regulated dispensing)

| # | Task | Done | Notes |
|---|------|------|-------|
| 1 | Log in with your named pharmacist account (no shared logins). | ☐ | |
| 2 | Confirm your registration details are on file and current. | ☐ | |
| 3 | Review overnight prescription queue: held, rejected, pending, repeat requests. | ☐ | |
| 4 | Review H/H1/X queue — assign owner for each unresolved item before accepting new orders. | ☐ | |
| 5 | Spot-check controlled drug register: batch counts match physical count. | ☐ | |
| 6 | Spot-check near-expiry stock (≤ 30 days): quarantine if dispensing is not appropriate. | ☐ | |
| 7 | Check cold-chain storage temperature log (if applicable). | ☐ | |
| 8 | Confirm emergency stop is NOT set: `node scripts/emergency-stop.mjs --status` → `active: false`. | ☐ | |
| 9 | Sign opening checklist in the system: Admin → Shift → Open Shift. | ☐ | |

---

### Prescription intake (for each prescription received)

| # | Task | Done | Notes |
|---|------|------|-------|
| 1 | Verify prescription is readable, complete, and not expired. | ☐ | |
| 2 | Confirm patient identity and order linkage (no unverified walk-ins for regulated items). | ☐ | |
| 3 | Confirm the medicine name, strength, dosage form, quantity, and prescriber details. | ☐ | |
| 4 | Check for contraindications and allergy warnings (advisory only — pharmacist decides). | ☐ | |
| 5 | Select the appropriate outcome: Approve / Partial approve / Reject / Hold / Emergency stop. | ☐ | |
| 6 | Record pharmacist ID, timestamp, and decision in the system. | ☐ | |
| 7 | For H/H1/X: complete statutory register fields before release. | ☐ | |
| 8 | For Schedule X / controlled drug: follow controlled drug SOP (OPERATIONS.md). | ☐ | |

---

### Prescription validation checkpoints

For every prescription, the pharmacist must verify and document:

- [ ] Patient identity / order match
- [ ] Medicine name, generic, strength, dosage form, quantity
- [ ] Prescriber name, registration number, date (if required)
- [ ] Prescription is not forged, altered, expired, or illegible
- [ ] Batch selected for FEFO (First Expiry First Out) compliance
- [ ] Stock batch has no open quarantine or discrepancy
- [ ] H1 register fields complete for Schedule H1 items
- [ ] Substitution NOT offered or applied (prohibited)

---

### Closing (before shift ends)

| # | Task | Done | Notes |
|---|------|------|-------|
| 1 | Confirm no unowned H/H1/X or held prescriptions remain. | ☐ | |
| 2 | Verify controlled drug register matches physical count. | ☐ | |
| 3 | Hand off all pending prescriptions to incoming pharmacist with explicit owner transfer. | ☐ | |
| 4 | Record shift reconciliation summary: any overrides, rejections, H1 records. | ☐ | |
| 5 | Check for open dead letters in the OCR queue — assign owner. | ☐ | |
| 6 | Sign closing checklist in the system: Admin → Shift → Close Shift. | ☐ | |

---

## Weekly tasks

| # | Task | Cadence | Done | Notes |
|---|------|---------|------|-------|
| 1 | Review H1 register for the week — confirm all releases have complete statutory records. | Weekly | ☐ | |
| 2 | Review Schedule X / controlled drug ledger — confirm no discrepancies. | Weekly | ☐ | |
| 3 | Check near-expiry stock report: items expiring within 90 days. | Weekly | ☐ | |
| 4 | Review prescription rejection patterns — are any repeat resubmissions a concern? | Weekly | ☐ | |
| 5 | Sign off on weekly reconciliation summary (pharmacist domain items only). | Weekly | ☐ | |
| 6 | Review updated OPERATIONS.md for any SOP changes. | Weekly | ☐ | |

---

## Escalation reminders

You have stop-the-line authority for any of the following. Do not wait for manager approval:

- Forged or suspicious prescription
- Unusual refill quantity or early repeat
- Batch count mismatch for a controlled drug
- AI/OCR suggestion that conflicts with the prescription
- Any doubt about patient identity, product safety, or stock integrity

When in doubt: **HOLD and escalate.** Record the reason in the system immediately.

---

## Contact (fill in before launch)

| Role | Name | Phone |
|------|------|-------|
| Pharmacist-in-charge | TBD | TBD |
| Store manager | TBD | TBD |
| Incident commander | TBD | TBD |
| Legal/compliance | TBD | TBD |

---

_Pharmacist signature and date: ____________________  /  ____________________  (required at each shift start)_
