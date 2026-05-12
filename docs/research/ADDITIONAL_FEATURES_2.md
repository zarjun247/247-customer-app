# ADDITIONAL_FEATURES_2.md — Production Readiness, Accounting, Statutory Reporting and 10/10 Launch Addendum

## Purpose

This document extends `docs/ADDITIONAL_FEATURES.md` with the newest production-readiness requirements for the 24/7 Pharmacy OS.

The original additional-features roadmap defines future moat-building systems such as Medication Continuity Graph, Building Health Index, SLA Reality Engine, FEFO intelligence, OCR procurement, refill intelligence, family medicine graph, insurance automation, compliance score engine, GST reports, accounting basics, H1 register, Tally compatibility and other legacy parity features.

This file adds the next layer:

- production accounting truth
- GST and income-tax support artifacts for India
- accountant-ready reporting packs
- cash sales and cash drawer reporting
- daily / weekly / monthly / quarterly / yearly reporting
- email-ready accounts packs
- no-fake-success production doctrine
- controlled-production pilot definition
- race-mode production definition
- final 10/10 launch requirements

This is not a random wish-list. This is a production doctrine addendum.

The goal is to make the system:

- controlled-production-ready
- accountant-ready
- compliance-safe
- audit-friendly
- no-stub / no-placeholder
- investor-demo-ready
- category-shaking

---

# 1. Absolute Production Doctrine

The system must never fake operational truth.

## 1.1 Forbidden Production Behavior

The following are forbidden in production:

- fake provider success
- fake OCR success
- fake storage success
- fake email sent success
- fake WhatsApp / SMS / OTP success
- fake printer success
- fake payment success
- fake refund success
- fake Tally / accounting sync success
- fake GST totals
- fake accounting reports
- fake DB proof
- fake healthcheck green
- placeholder URLs treated as real evidence
- mock/demo providers pretending to be real providers
- synthetic reports disconnected from source records
- regulated medicine release without pharmacist/Rx/legal evidence
- stock mutation without source movement truth
- production-ready claims without validation

If an operation cannot be proven, it must be marked honestly.

Allowed non-success states include:

- `not_configured`
- `disabled`
- `manual_required`
- `queued`
- `pending`
- `failed`
- `retrying`
- `dead_letter`
- `cancelled`

These states must never be displayed, logged, or exported as successful completion.

---

# 2. Accounting + Statutory Reporting Layer

## 2.1 Goal

The Pharmacy OS must become accountant-ready.

This means the system should generate accurate, traceable, exportable reports required by the accounts team for:

- daily operational reconciliation
- weekly accounts review
- monthly GST preparation
- quarterly statutory review
- yearly income-tax and audit support
- inventory valuation
- supplier reconciliation
- cash accountability
- Tally / accounting-system import where supported

The system prepares report packs and export artifacts.

The accountant files GST, income-tax and statutory returns.

The system must not claim that it has filed GST returns, filed income-tax returns, or replaced a qualified accountant.

---

# 3. Daily Purchase Reports

## 3.1 Required Purchase Report Fields

Daily purchase reports must include, wherever available:

- store / location
- supplier name
- supplier GSTIN
- purchase invoice number
- purchase invoice date
- purchase invoice internal reference
- SKU / product ID
- product display name
- raw supplier item name
- manufacturer
- pack size
- batch number
- expiry date
- quantity purchased
- free quantity, if applicable
- MRP
- purchase rate
- landing cost, if available
- taxable value
- GST rate
- CGST amount
- SGST amount
- IGST amount
- total GST amount
- gross invoice value
- net invoice value
- HSN code
- purchase return references
- debit note references
- stock movement references
- purchase commit reference
- created by
- approved by
- commit timestamp
- exception status

## 3.2 Purchase Report Rules

Daily purchase reports must:

- reconcile to purchase invoice records
- reconcile to purchase line records
- reconcile to batch creation / update records
- reconcile to stock movements
- show missing HSN/GST/GSTIN/batch/expiry fields as exceptions
- never invent missing statutory fields
- never mark OCR purchase drafts as committed purchases unless human-approved and committed
- distinguish draft, approved, committed, cancelled and returned purchases
- distinguish OCR-imported, CSV-imported, manually entered and supplier-synced purchases

---

# 4. Daily Sales Reports

## 4.1 Required Sales Report Fields

Daily sales reports must include, wherever available:

- store / location
- invoice number
- invoice date/time
- sale ID / order ID
- sale channel:
  - POS
  - customer app
  - WhatsApp
  - refill
  - admin/manual
- privacy-safe customer reference
- SKU / product ID
- product display name
- batch number
- expiry date
- HSN code
- GST rate
- taxable value
- CGST amount
- SGST amount
- IGST amount
- total GST amount
- MRP
- sale rate
- quantity sold
- gross line amount
- discount amount
- net line amount
- payment mode:
  - cash
  - UPI
  - card
  - online gateway
  - credit
  - mixed
- payment reference
- cash/card/UPI split
- refund references
- credit note references
- sale return references
- COGS, where available
- gross margin, where available
- stock movement references
- pharmacist approval reference, where applicable
- H1 / Rx reference, where applicable
- delivery reference, where applicable
- invoice snapshot reference
- exception status

## 4.2 Sales Report Rules

Daily sales reports must:

- reconcile to canonical commercial events
- reconcile to invoices
- reconcile to payment records
- reconcile to stock movements
- reconcile to refunds / returns / credit notes
- preserve privacy-safe customer references
- not expose unnecessary medical data
- never use synthetic totals
- never count cancelled or failed orders as completed sales
- never count unpaid orders as paid
- never count refunded amounts as net retained revenue
- distinguish gross sales, discounts, net sales, taxes, refunds and credit notes

---

# 5. Cash Sales and Cash Drawer Reporting

## 5.1 Required Cash Report Fields

Cash reports must include:

- store / location
- shift ID
- cashier / staff reference
- opening cash
- cash sales
- cash refunds
- petty cash adjustments, if supported
- cash deposit / handover amount
- expected closing cash
- actual closing cash
- variance amount
- variance reason
- manager approval reference, where needed
- cash drawer close timestamp
- linked invoices
- linked refunds
- linked credit notes
- linked shift closing
- exception status

## 5.2 Cash Control Rules

The system must:

- separate cash sales from UPI/card/online gateway sales
- track cash refunds separately
- require reason for cash variance
- require manager approval for material variance
- include daily and weekly cash summaries for accounts
- reconcile cash totals to shift closing
- never silently absorb cash mismatch
- never fake cash drawer close

---

# 6. Weekly Accounts Email Pack

## 6.1 Goal

The system must generate a weekly accounts pack for the accounts team.

The pack should be email-ready and downloadable.

If email provider is configured and successfully sends the email, the system may mark it as sent.

If email provider is not configured, disabled, or fails, the system must mark:

- `not_configured`
- `manual_required`
- `failed`
- or equivalent non-success state

It must still generate the downloadable pack where possible.

It must never fake email success.

## 6.2 Weekly Accounts Pack Contents

The weekly pack should include:

- daily purchase summaries
- daily sales summaries
- daily cash summaries
- cash drawer / variance report
- GST output summary
- GST input summary
- HSN-wise sales summary
- HSN-wise purchase summary
- supplier outstanding summary
- supplier payment summary
- stock valuation report
- stock movement summary
- opening and closing stock summary
- purchase returns
- debit notes
- sale returns
- credit notes
- refunds
- discount summary
- margin summary where available
- missing statutory data exception list
- missing HSN exception list
- missing GST rate exception list
- missing supplier GSTIN exception list
- missing batch/expiry exception list
- invoice numbering gaps, if any
- payment mismatch exceptions
- cash variance exceptions
- Tally/export status, if available

## 6.3 Export Formats

Use formats already supported by the stack wherever possible.

Preferred formats:

- CSV
- XLSX, if supported
- PDF, if supported
- JSON manifest for audit / automation
- Tally-compatible export where available

No new export format should be declared production-ready unless it is actually implemented and validated.

---

# 7. Monthly / Quarterly / Yearly Statutory Packs

## 7.1 GST Support Artifacts

The system should prepare GST support artifacts including:

- sales register
- purchase register
- GST output tax summary
- GST input tax summary
- HSN-wise outward summary
- HSN-wise inward summary
- credit notes
- debit notes
- sale returns
- purchase returns
- taxable value summary
- tax rate summary
- invoice sequence summary
- missing GST data exception report

## 7.2 Income-Tax / Bookkeeping Support Artifacts

The system should prepare accountant-ready bookkeeping support including:

- revenue summary
- purchase summary
- expense/payment support where available
- supplier ledger
- customer ledger where applicable
- inventory valuation
- opening stock
- closing stock
- COGS support
- gross margin summary
- cash sales summary
- payment mode summary
- refund and return summary
- write-off / expiry loss summary
- debit note / credit note summary
- Tally/accounting export files where supported

## 7.3 Yearly Audit Support Pack

The yearly audit support pack should include:

- full purchase register
- full sales register
- HSN summary
- GST summary
- supplier outstanding
- inventory valuation
- stock movement summary
- expired / disposed stock summary
- stock adjustment summary
- cash variance summary
- refund / credit note / debit note summary
- payment gateway settlement summary, if available
- statutory master-data exception history
- audit log references for sensitive corrections

---

# 8. Accounting Truth Rules

Every accounting and statutory report must trace to source truth.

Source truth includes:

- canonical commercial events
- sale/order records
- invoice snapshots
- payment records
- refund records
- credit notes
- purchase invoices
- purchase lines
- debit notes
- supplier ledger entries
- stock movements
- batch records
- stock valuation records
- cash drawer / shift closing records
- audit logs

## 8.1 No Synthetic Reports

Reports must not use synthetic totals.

If a value is estimated, draft, pending, missing, or manually adjusted, it must be labelled clearly.

## 8.2 Exception-First Reporting

Missing or invalid statutory data must not be silently ignored.

The system must surface exceptions such as:

- missing HSN code
- missing GST rate
- missing supplier GSTIN
- missing invoice number
- duplicate invoice number
- invoice sequence gaps
- missing batch number
- missing expiry
- missing purchase rate
- missing MRP
- negative stock
- stock movement mismatch
- payment mismatch
- refund mismatch
- tax mismatch
- cash variance
- unposted accounting event
- failed export
- email provider not configured
- Tally export not confirmed

## 8.3 Accountant Boundary

The system prepares accountant-ready reports.

The accountant remains responsible for:

- review
- correction
- filing GST returns
- filing income-tax returns
- statutory interpretation
- final submission
- professional judgment

The runtime UI and reports must not claim:

- GST return filed
- income-tax return filed
- statutory compliance completed
- accountant approval received

unless such approval or filing evidence is explicitly recorded.

---

# 9. Email / Provider Truth for Accounts Packs

Accounts email/report delivery must follow provider truth rules.

## 9.1 Valid States

Valid states include:

- `generated`
- `queued`
- `sent`
- `failed`
- `not_configured`
- `manual_required`
- `cancelled`

## 9.2 Success Rules

The system may only mark an accounts email as `sent` if:

- email provider is configured
- send call succeeds
- provider response or deterministic local mail-send proof exists
- attempt is recorded where provider runtime exists

## 9.3 Failure Rules

If email is not configured or fails:

- generate downloadable pack where possible
- record non-success status
- expose manual send instructions
- do not pretend the email was sent
- do not hide the failure from admin/accounts view

---

# 10. Tally / Export Compatibility

Where existing services support Tally or accounting exports, the system should extend them toward production-grade export truth.

## 10.1 Required Export Discipline

Exports should include:

- deterministic file generation
- checksum or hash where supported
- generated timestamp
- generated by
- export type
- date range
- store/location
- source data count
- exception count
- generated / failed / manual_required state
- imported/synced state only if confirmed
- duplicate export protection where applicable

## 10.2 Forbidden Export Behavior

The system must not:

- mark Tally export as imported unless confirmed
- mark accounting sync as successful without proof
- hide export failures
- generate empty files as successful reports
- exclude exceptions without listing them

---

# 11. Sprint Placement

The new accounting/statutory layer must be implemented in the production sprint, not forgotten as “later polish.”

Recommended mega-sprint order:

1. Baseline lock
2. Additional roadmap memory / this file
3. No fake success cleanup
4. Observability + healthchecks + redaction
5. Provider runtime + reservation lifecycle truth
6. Accounting/reporting/email packs/GST-IT export readiness
7. DB proof + reconciliation proof
8. Pharmacy legal ops + offline/manual fallback
9. Final release gate + controlled pilot signoff

## 11.1 Implementation Rules

Agents must not implement all features blindly.

For every mega-sprint:

1. Stabilize
2. Extend
3. Verify
4. Document limitations

Do not create duplicate truth systems.

Prefer extending existing modules.

Do not bypass existing stock, payment, compliance, audit, reporting, or commercial truth services.

---

# 12. Controlled-Production Pilot Definition

The system can be considered controlled-production-pilot-ready only if all of the following are true or explicitly listed as blockers:

- `pnpm run check` passes
- `pnpm test -- --runInBand` passes
- `pnpm run build` passes
- migration verifier passes
- governance scanner passes
- no duplicate migrations exist
- no fake provider success remains
- no fake OCR/storage/email/accounting success remains
- no fake healthcheck green remains
- stock truth is protected
- reservation lifecycle is explicit
- order/payment/reporting truth is reconciled
- pharmacist/Rx/H/H1/X gates remain intact
- GST/accounting reports are traceable or explicitly marked incomplete
- DB proof is green or explicitly listed as pending/blocker
- known operational limitations are documented
- no P0 blockers remain
- P1 blockers are either fixed or accepted for controlled pilot with mitigation

Controlled pilot does not mean race-mode production.

Controlled pilot means limited real-store deployment with human supervision, daily reconciliation and manual fallback.

---

# 13. Race-Mode Production Definition

The system is race-mode production-ready only after:

- real DB-backed concurrency proof passes
- payment/provider sandbox or production proof exists
- webhook replay safety is proven
- refund replay safety is proven
- reservation race safety is proven
- purchase commit double-submit safety is proven
- invoice number race safety is proven
- stock cannot go negative under tested contention
- backup/restore drill is completed
- 7-day live Salsette reconciliation is completed
- cash reports reconcile to drawer and payment records
- GST/accounting packs reconcile to source records
- stock valuation reconciles to physical stock
- regulated release evidence is complete
- no P0 or unresolved P1 blockers remain
- staff SOPs are trained
- offline/manual fallback is tested
- observability alerts are active
- production incident runbook exists

Race-mode means the system can handle real staff, real customers, real payments, real stock, real compliance pressure and real mistakes.

---

# 14. Final 10/10 Launch Bar

The final system must be:

- production-ready
- ready to ship for controlled pilot
- no-stub
- no-placeholder
- provider-truthful
- stock-truthful
- accounting-truthful
- GST-reporting-ready
- pharmacist-gated
- Rx/H/H1/X-safe
- payment-safe
- refund-safe
- reservation-safe
- audit-safe
- privacy-aware
- observable
- failure-safe
- accountant-ready
- investor-demo-ready
- category-shaking

If a module is not fully implemented, it must say so honestly.

No fake green.

No fake success.

No hidden TODOs in production-critical paths.

---

# 15. Agent Instructions

This file is mandatory context for future production-roadmap work.

Agents must:

- read this file before production-roadmap tasks
- obey `AGENT_INSTRUCTIONS.md`
- obey `docs/PRODUCT_NORTH_STAR.md`
- obey `docs/PHARMACY_OS_BLUEPRINT.md`
- obey `docs/ADDITIONAL_FEATURES.md`
- stabilize before extending
- extend existing services before creating new truth systems
- avoid broad rewrites
- avoid branch fragmentation
- avoid duplicate migrations
- avoid package-lock churn unless task requires it
- run validation honestly
- document skipped tests honestly
- never claim DB proof unless DB-backed tests run
- never claim provider proof unless provider calls or sandbox proof exist
- never claim accounting/GST proof unless reports reconcile to source records

---

# 16. Non-Negotiable Validation Commands

For production-roadmap changes, run:

```bash
pnpm run check
pnpm test -- --runInBand
pnpm run build
node scripts/verify-migrations.mjs
node scripts/ci-governance-guards.mjs all
git diff --check
