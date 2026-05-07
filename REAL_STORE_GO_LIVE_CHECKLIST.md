# REAL_STORE_GO_LIVE_CHECKLIST

Documentation-only real-store readiness checklist. This checklist is intended for Salsette/current store cutover and later can be copied for each additional store. It does not claim the store is production-ready until every item has evidence and owner sign-off.

## Store context

| Field | Placeholder |
| --- | --- |
| Store name | Salsette / current store |
| Go-live date | TBD |
| Store owner | TBD |
| Technical owner | TBD |
| Rollback owner | TBD |
| Backup ID before cutover | TBD |
| Release commit | TBD |

## Data preparation

- [ ] Salsette/current store master profile reviewed: legal name, address, GST/license fields, contact numbers, operating hours.
- [ ] Staff list validated and inactive users disabled.
- [ ] Supplier master data imported or prepared.
- [ ] Customer import policy approved, including privacy and duplicate handling.
- [ ] Product master import source frozen for dry run.
- [ ] Opening stock physical count sheet completed and signed off.
- [ ] Backup/restore and rollback evidence attached before final cutover.

## Product master import dry run

- [ ] Import dry run completed in staging with the same file/template expected for production.
- [ ] Required fields mapped: product name, manufacturer, pack, composition where available, barcode, GST, HSN, schedule, MRP, batch/expiry when applicable.
- [ ] Rejected rows reviewed and corrected.
- [ ] Import is idempotent or duplicate-safe for reruns.
- [ ] Dry-run counts reconciled with source file totals.

## Duplicate product review

- [ ] Duplicate candidate report generated.
- [ ] Same product with variant pack/strength reviewed separately.
- [ ] Barcode collisions reviewed.
- [ ] Supplier SKU mapping duplicates reviewed.
- [ ] Final merge/keep decisions signed off by store owner or inventory owner.

## Opening stock import using stockInvariant-only rule

- [ ] Opening stock is imported only through the approved stock invariant path; no direct table edits.
- [ ] Batch-level quantity, expiry, MRP, GST, HSN, and schedule data are present before stock is made saleable.
- [ ] Import creates auditable stock movements with actor, reason, and source file reference.
- [ ] Post-import stock ledger totals reconcile with physical count totals.
- [ ] Negative or quarantined stock exceptions are resolved before go-live.

## Batch/expiry/MRP/GST/HSN/schedule completeness

- [ ] Batch number present where required.
- [ ] Expiry date present and valid for medicines requiring batch tracking.
- [ ] MRP present and matches latest approved source.
- [ ] GST rate present and reviewed.
- [ ] HSN present where statutory reporting requires it.
- [ ] Schedule/H1/regulatory classification present for regulated products.
- [ ] Non-saleable/expired items quarantined or excluded.

## Operational dry runs

| Dry run | Required checks | Evidence |
| --- | --- | --- |
| Barcode label printing | Generate label, print, scan back into product/batch, verify fallback queue on printer offline. | TBD |
| POS sale | Search/scan product, create sale, enforce stock, collect payment mode, generate invoice/receipt. | TBD |
| Refund/return | Return eligible item, restore/adjust stock according to policy, record refund state and audit. | TBD |
| Prescription upload/Rx review | Upload prescription, review, approve/reject, confirm vault access audit and redaction. | TBD |
| H1 register | Sell regulated/H1 item through approved flow and verify required register data completeness. | TBD |
| Delivery | Create delivery order, assign/track/complete, verify SLA and notification behavior. | TBD |
| Payment mode | Dry run cash, card/UPI/manual mode, Razorpay sandbox/live penny test where approved, and failure/retry behavior. | TBD |
| Daily closing/reconciliation | Reconcile cash/card/UPI/Razorpay, sales, refunds, invoices, stock deltas, and exceptions. | TBD |

## Staff login/role checklist

- [ ] Super-admin/admin role validated.
- [ ] Pharmacist/Rx reviewer role validated.
- [ ] Cashier/POS role validated.
- [ ] Inventory/purchase role validated.
- [ ] Delivery/rider role validated where used.
- [ ] Staff cannot access another store unless explicitly authorized.
- [ ] Staff without assigned store fails closed for store-scoped operations.
- [ ] Password/session/OTP policy tested.
- [ ] Emergency admin access holder named and audited.

## Emergency rollback plan

- [ ] Previous app artifact/commit available.
- [ ] Pre-cutover DB backup ID recorded.
- [ ] Storage backup/snapshot ID recorded.
- [ ] Worker/cron disable command/procedure known.
- [ ] Provider disable plan documented for payment, SMS, WhatsApp, printer, and ERP/Tally.
- [ ] Manual billing/stock fallback procedure available to store staff.
- [ ] Reconciliation owner assigned for any manual transactions during rollback window.
- [ ] Customer/store communication template prepared.

## Go/no-go sign-off

- [ ] Deployment runbook completed.
- [ ] Backup/restore drill current.
- [ ] Monitoring alerts enabled.
- [ ] Healthcheck requirements mapped to actual checks or accepted gaps.
- [ ] Real-store dry runs passed with evidence.
- [ ] Remaining risks accepted by business and technical owner.
