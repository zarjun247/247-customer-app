# CURRENT MAIN TRUTH AUDIT

Date (UTC): 2026-05-02

## 1) Repository state at audit start
- Intended upstream sync with `origin/main` could not be performed because no `origin` remote is configured in this environment.
- Current branch before audit branch creation: `work`
- Audit branch: `chore/current-main-truth-audit`
- Latest commit hash at start: `ef83470fd4a46545b287ec6067b128d463dc3bcb`
- Latest commit timestamp: `2026-05-02T01:43:52+05:30`
- Working tree cleanliness before edits: clean (`git status --porcelain` empty)

## 2) Validation results
Initial validation:
- `pnpm install`: pass (lockfile up to date)
- `pnpm run check`: pass
- `pnpm test`: pass (6 files, 73 tests)
- `pnpm run build`: pass with non-blocking warnings (analytics env placeholders undefined + chunk size warning)

Final validation:
- `pnpm run check`: pass
- `pnpm test`: pass
- `pnpm run build`: pass with same non-blocking warnings

## 3) Production-readiness score
**Score: 7.9 / 10**

Reasoning summary:
- Strong route guards and role-gated route groups are present.
- Core tables for audit/stock/sales/purchase/prescription/H1/ledger/OCR/delivery/WhatsApp exist.
- Important stubs/partials remain in audit standardization, stock movement qtyBefore/qtyAfter fidelity, connector stubs, and placeholder admin modules.

## 4) Module status matrix (present / partial / missing / broken)

| Area | Status | Notes |
|---|---|---|
| Admin route guard/equivalent | Present | `RestrictedRoute` role-based guarding is implemented.
| Staff route guard/equivalent | Present | Same guard pattern with `STAFF_ROLES`.
| Customer role blocked from `/admin/*` | Present | `/admin/*` routes are wrapped with admin role allowlist.
| Unauthenticated redirect to `/login` | Present | Auth hook and route guard mention explicit redirect behavior.
| Legacy staff-only routes protection | Present | Enumerated routes are wrapped under role-guarded routes.
| `/admin/masters/customers` mapping correctness | **Wrong** | Mapped to `AdminPatientCategories` instead of customer masters module.
| Mobile/customer app readiness + API compatibility | Partial | Customer routes/tests exist; likely connected, but no live integration verification in this environment.
| Central audit service | Partial | `server/db.ts` has central `writeAuditLog`, but multiple routers still use local wrappers/direct inserts.
| Direct audit inserts remaining | Present (risk) | Multiple `db.insert(auditLogs)` usages remain.
| Stock movement with qtyBefore/qtyAfter real values | Partial/Broken | Several flows still persist `0` placeholders.
| FEFO allocation | Partial | Batch/expiry infrastructure exists; deterministic FEFO enforcement path not uniformly evident in all sales flows.
| Rx/H/H1/X schema flags | Partial | Prescription + H1 structures exist; strict schedule field enforcement appears uneven across sales/cart/POS.
| H1 register and creation | Present/Partial | Table and creation path exist, but depends on workflow coverage.
| Purchase + OCR flows | Present/Partial | Routers/pages exist with OCR pipeline and review entities; includes mock/stub parsing in places.
| Reports/accounting consistency | Partial | Multiple report modules exist; consistent response shape and ledger-truth usage need hardening pass.
| WhatsApp bridge + delivery ops + SLA + command center | Present/Partial | Modules/routes/tables exist; some placeholders/stubs still present.

## 5) Exact files inspected
- `AGENTS.MD`
- `docs/PRODUCT_NORTH_STAR.md`
- `docs/PHARMACY_OS_BLUEPRINT.md`
- `docs/ADDITIONAL_FEATURES.md`
- `RELEASE_CHECKPOINT.md`
- `PILOT_RUNBOOK.md`
- `FINAL_EXPORT_MANIFEST.md`
- `client/src/App.tsx`
- `client/src/_core/hooks/useAuth.ts`
- `server/db.ts`
- `server/routers/salesRouter.ts`
- `server/routers/purchaseRouter.ts`
- `server/routers/inventoryRouter.ts`
- `server/routers/prescriptionGovRouter.ts`
- `server/routers/ocrIngestionRouter.ts`
- `server/connectors.ts`
- `server/routers/commandCenterRouter.ts`
- `drizzle/schema.ts`

## 6) Risky/fake/stub patterns found (representative)
- `/admin/masters/customers` mapped to wrong module:
  - `client/src/App.tsx` route points to `AdminPatientCategories`.
- Direct audit inserts and local wrapper duplication:
  - `server/routers/salesRouter.ts` local `writeAuditLog` + direct `db.insert(auditLogs)`.
  - `server/routers/purchaseRouter.ts` local `writeAuditLog` using direct insert.
  - `server/routers/inventoryRouter.ts` direct insert usage.
  - `server/routers/prescriptionGovRouter.ts` local `writeAuditLog` + direct insert.
  - `server/routers/ocrIngestionRouter.ts` local `writeAuditLog` + direct insert.
- Stock movement placeholder quantities (`qtyBefore: 0`, `qtyAfter: 0`):
  - `server/routers/salesRouter.ts` in confirm/return stock movement writes.
  - `server/routers/inventoryRouter.ts` transfer path with zero-based placeholders.
- Stub/mock/fallback operational behavior:
  - `server/connectors.ts` SMS/payment/printer/ERP stub behavior and console logs.
  - `server/routers/ocrIngestionRouter.ts` `mockOcrParse`.
  - `server/routers/commandCenterRouter.ts` placeholder card comments.
- Console logging used as runtime behavior in operational paths:
  - `server/connectors.ts`, `server/worker.ts`, parts of `server/routers.ts`.

## 7) Drizzle schema map (existing tables relevant to requested domains)
- **Audit:** `audit_logs`
- **Stock/inventory:** `batches`, `stock_movements`, `batch_ledger`
- **Sales/POS:** `sales`, `sale_lines`, `counter_payments`
- **Purchase:** `purchase_invoices`, `purchase_invoice_lines`, `purchase_returns`, `purchase_return_lines`, `supplier_payments`
- **Prescriptions/compliance:** `prescriptions`, `prescription_governance`, `prescription_line_items`
- **H1 register:** `h1_register`
- **Delivery:** `riders`, `delivery_tasks`
- **WhatsApp:** `whatsapp_sessions`, `whatsapp_links`, `whatsapp_messages`, `whatsapp_carts`, `whatsapp_cart_lines`, `whatsapp_webhook_log`
- **Payments:** `counter_payments`, `supplier_payments`, plus order/payment fields in `orders` and `sales`
- **Reports/accounting:** `ledgers`, `ledger_entries`, transactional tables feeding reports
- **Shift closing:** `shift_closings`
- **OCR/ingestion:** `ocr_jobs`, `ingestion_jobs`, `ingestion_files`, `ocr_extracted_headers`, `ocr_extracted_lines`, `ocr_match_candidates`, `ocr_review_tasks`, `sku_creation_drafts`, `purchase_drafts`, `purchase_draft_lines`

Conclusion for schema-first doctrine:
- Existing schema already covers most required domains; immediate next PRs should prioritize invariant enforcement and router/service unification over adding duplicate tables.

## 8) Next 10 PRs (recommended order)
1. **audit-unification-pass-1** — replace router-local audit helpers with central audit service contract and normalize required audit fields.
2. **stock-movement-fidelity-pass-1** — compute true qtyBefore/qtyAfter in sales, returns, and transfers; prohibit placeholder zeros.
3. **admin-route-mapping-fix** — correct `/admin/masters/customers` route target and verify access matrix.
4. **rx-schedule-server-enforcement** — enforce Rx/H/H1/X gates server-side for cart, POS, sale confirmation, and release paths.
5. **fefo-allocation-hardening** — enforce deterministic FEFO allocator for sale line fulfillment against batch truth.
6. **purchase-ocr-commit-atomicity** — enforce strict atomic purchase draft commit with audit trail and movement linkage.
7. **reports-contract-standardization** — unify report payload shape `{ rows, csvData, totals? }` and source from ledger/truth tables.
8. **connector-productionization-toggle** — production-safe connector strategy (no silent stubs in prod), alerting, and environment guards.
9. **h1-governance-completion** — complete lawful H1 entry creation path coverage + repeat-dispense controls.
10. **ops-command-center-integrity** — remove placeholder panels, wire real signals for SLA, Medivision/import health, and override analytics.

## 9) Exact next PR prompt recommendation
```
Create branch: chore/audit-unification-pass-1

Goal:
Unify audit logging across server routers without adding new product features.

Scope:
- Replace local writeAuditLog wrappers in:
  - server/routers/salesRouter.ts
  - server/routers/purchaseRouter.ts
  - server/routers/inventoryRouter.ts
  - server/routers/prescriptionGovRouter.ts
  - server/routers/ocrIngestionRouter.ts
- Use one central audit service/helper contract from server/db.ts (or server/services/audit.ts if introduced as thin wrapper).
- Ensure every sensitive write path includes:
  actorType, actorId, actorRole, action, entityType, entityId,
  beforeJson, afterJson, reason, ipAddress/userAgent when available,
  source channel, createdAt.
- Remove direct db.insert(auditLogs) from router code where feasible.
- No migration unless strictly required.

Validation:
pnpm run check
pnpm test
pnpm run build

Deliverables:
- Changed files list
- Remaining known audit gaps (if any)
- Confirmation of no behavior changes beyond audit normalization
```

## 10) Tiny audit fix note
- `/admin/masters/customers` is currently wrong (mapped to `AdminPatientCategories`).
- Not changed in this PR to keep scope strictly documentary.
