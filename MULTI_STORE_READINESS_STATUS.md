# MULTI_STORE_READINESS_STATUS

Documentation-only multi-store readiness checklist. This file uses placeholders for Signet, Salsette, and NCP rollout notes and must not contain hard-coded secrets.

## Scope
- Store isolation, RBAC, inventory, reporting, supplier/payment scoping, transfers, statutory fields, and provider configuration readiness.
- Does not implement multi-store behavior and does not assert readiness without test evidence.

## Store rollout placeholders

| Store | Rollout notes | Secrets policy |
| --- | --- | --- |
| Salsette | Current/live or first-store readiness evidence placeholder. Confirm store profile, staff roles, inventory, providers, and statutory fields before go-live. | No secrets in docs; store credentials live only in approved secret manager. |
| Signet | Future rollout placeholder. Confirm fitout timeline, printer/network, staff onboarding, product/store mapping, and provider needs. | No secrets in docs. |
| NCP | Future rollout placeholder. Confirm LOI/opening timeline, statutory registration, data import source, and launch dependencies. | No secrets in docs. |

## Store-scoped RBAC checklist

- [ ] Store-scoped routes require staff store context or explicit super-admin/cross-store authorization.
- [ ] Staff cannot read or mutate another store's inventory, orders, prescriptions, reports, or payments by changing input IDs.
- [ ] Super-admin cross-store access is explicit, audited, and visible in logs.
- [ ] Store manager access is limited to assigned store unless separately approved.
- [ ] Background jobs preserve store scope and do not process records under an implicit default store.
- [ ] Staff fail closed without `staffStoreId` for store-scoped operations.

## Store-specific inventory

- [ ] Product master can be shared where appropriate, but stock quantities are store-specific.
- [ ] Batch, expiry, MRP, barcode, quarantine, and reserved quantities are scoped to the correct store.
- [ ] Opening stock import is performed per store through stock invariant paths only.
- [ ] Stock audit and correction reports are per store.
- [ ] Negative stock attempts are alertable with store/SKU/batch context.

## Store-specific reports

- [ ] Daily sales report filters by store.
- [ ] Stock mismatch and ageing reports filter by store.
- [ ] H1/statutory reports include store statutory identity where required.
- [ ] Refunds, supplier outstanding, and settlement reports do not mix stores unintentionally.
- [ ] Super-admin cross-store dashboards clearly label store totals and combined totals.

## Store-specific supplier/payments where applicable

- [ ] Supplier mappings support store-specific terms, outstanding balances, and purchase documents where the business requires it.
- [ ] Supplier payments are attributed to the correct store or shared entity with explicit accounting treatment.
- [ ] Payment modes and provider settlements can be reconciled per store.
- [ ] Refund liability and settlement reports are store-scoped.

## Super-admin cross-store view

- [ ] Cross-store view requires explicit super-admin permission.
- [ ] Cross-store exports and dashboards are audited.
- [ ] Store filters are mandatory in operational drill-downs to avoid accidental cross-store actions.
- [ ] Aggregate metrics distinguish combined totals from store-level totals.

## Transfer stock flow

- [ ] Transfer initiation identifies source store, destination store, product, batch, and quantity.
- [ ] Source store stock is reserved/quarantined according to approved invariant policy.
- [ ] Destination receipt creates auditable movement and does not bypass stock invariants.
- [ ] In-transit, cancelled, partially received, and rejected transfers are reportable.
- [ ] Transfer permissions are limited to authorized staff and audited.

## Per-store GST/license/statutory fields

- [ ] Legal entity/store name.
- [ ] GSTIN and tax registration details where applicable.
- [ ] Drug license/statutory license numbers and validity dates.
- [ ] Store address and invoice footer/legal text.
- [ ] H1/register statutory metadata and responsible pharmacist where required.
- [ ] Renewal reminders and missing-data alerts.

## Per-store provider config if relevant

- [ ] Payment/Razorpay account, route, settlement, or descriptor mapping per store if business requires separate settlement.
- [ ] SMS sender/template constraints documented per store if different.
- [ ] WhatsApp business number/template mapping per store if different.
- [ ] Printer host/port/name and label format per store.
- [ ] ERP/Tally company, cost center, voucher mapping, or export path per store.
- [ ] Object storage prefixes/buckets are store-aware only if required by access policy.

## Readiness evidence required before adding a store

- [ ] Store data prep completed.
- [ ] Staff and RBAC dry run completed.
- [ ] Opening stock imported and reconciled.
- [ ] POS/refund/Rx/H1/delivery/payment/daily closing dry runs completed.
- [ ] Monitoring, healthcheck, backup, restore, and rollback procedures reviewed for the new store.
- [ ] Remaining store-specific risks accepted by business and technical owner.
