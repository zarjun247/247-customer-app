# STORE_ONBOARDING_CHECKLIST

Updated: 2026-05-10.

## Purpose

This checklist must be completed for every pharmacy store before it is allowed into controlled production. It protects store isolation, stock truth, commercial truth, regulated dispensing gates, PHI/PII handling, and operational accountability.

## Store profile

- Store legal name:
- Store operating name:
- Store ID / system identifier:
- Address:
- License/registration references:
- Pharmacist-in-charge:
- Store manager:
- Launch date:
- Launch approval owner:

## Required setup

| Area | Checklist |
| --- | --- |
| Store configuration | Store record exists; address/contact details verified; tax/statutory identifiers recorded where required; delivery/service area configured; operating hours confirmed. |
| Staff access | Named users only; no shared admin; role assigned; store scope assigned; removal/escalation path documented; suspicious access review owner assigned. |
| Pharmacist controls | Pharmacist account active; H/H1/X review path understood; prescription review and substitution SOP signed; H1/statutory record process confirmed. |
| Stock baseline | Opening stock counted; expired/quarantined/recalled/damaged/blocked stock separated; batch/expiry data loaded where required; FEFO process understood; stock exception owner assigned. |
| Commercial baseline | Payment modes configured; refund path tested in staging; cash/manual process documented; daily reconciliation owner assigned. |
| Provider setup | Store-specific payment, notification, map/delivery, OCR, printer, storage, and accounting/export configuration verified or explicitly disabled. |
| Accounting/compliance | Invoice numbering/tax settings reviewed; supplier invoice duplicate policy communicated; statutory export owner assigned. |
| Hardware | Printer/scanner/barcode/payment devices tested in staging or manual fallback documented. |
| Training | Staff complete role training; pharmacist completes regulated gate training; manager completes incident/manual fallback training. |
| Backup/fallback | Store knows outage process, manual sale/dispensing/refund logs, data re-entry approval, and emergency stop trigger. |
| Monitoring | Store launch channel created; primary/secondary support contacts assigned; daily review schedule accepted. |

## Pre-live dry run

Run a full staging rehearsal before live enablement:

1. Staff login and store scope check.
2. Non-regulated order flow.
3. Prescription-required order flow ending in pharmacist review.
4. H/H1/X blocked/review path.
5. Payment provider sandbox success/failure/refund path.
6. Stock reservation, cancellation, expiry, and manual exception review.
7. Provider dead-letter/retry review.
8. Invoice/accounting export review.
9. Manual fallback and re-entry simulation.
10. Emergency stop notification drill.

## Live day-0 checklist

- Launch owner present.
- Pharmacist-in-charge present or on formally approved duty coverage.
- Incident commander reachable.
- Provider dashboard access available.
- Monitoring dashboards accessible to authorized staff.
- Manual fallback template available.
- Daily reconciliation meeting scheduled.
- Stock exception review meeting scheduled.
- Emergency stop and rollback procedure visible to launch team.

## Signoff

| Role | Name | Date | Signature / approval reference |
| --- | --- | --- | --- |
| Store manager |  |  |  |
| Pharmacist-in-charge |  |  |  |
| Operations lead |  |  |  |
| Engineering/release owner |  |  |  |
| Compliance/legal owner |  |  |  |
| Incident commander |  |  |  |
