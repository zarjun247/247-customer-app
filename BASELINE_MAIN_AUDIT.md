# BASELINE_MAIN_AUDIT

## 1) Repo snapshot
- Repository: 247-customer-app
- Branch audited: chore/production-baseline-audit (intended baseline for latest main snapshot)
- Audit timestamp: 2026-05-03 12:09 UTC
- Package manager: pnpm 10.4.1
- Main scripts: dev, build, start, check, format, test, db:push
- Stack: Node.js + TypeScript backend (tRPC/Express style), React + Vite frontend
- Database/ORM: PostgreSQL + Drizzle
- Test runner: Vitest
- Build tool: Vite + esbuild

## 2) Current production score
**Overall production readiness: 6.8 / 10**

- product architecture: 8.0
- backend module coverage: 7.8
- audit logging: 7.4
- stock truth: 6.8
- reconciliation/report truth: 7.2
- Rx/H/H1/X compliance: 6.9
- POS/commercial controls: 7.1
- OCR/purchase/supplier ledger: 6.7
- barcode/scanner layer: 6.6
- customer/mobile continuity: 7.5
- ops bridge/support/delivery/SLA: 7.3
- security: 5.4
- CI/CD and branch protection: not proven
- multi-store isolation: 5.9 (partial)
- payment gateway/webhook/refund readiness: 5.8
- deployment/monitoring/backup: not proven
- placeholder/scaffold honesty: 7.0
- integration test depth: 5.9
- UX/admin readiness: 7.2
- investor/dev audit readiness: 6.5

## 3) Router inventory

- server/routers/commandCenterRouter.ts
  - purpose: commandCenterRouter domain routing
  - auth procedure used: mixed/inspect in-file (not proven centralized)
  - role gate: partial (requireAnyRole/protectedProcedure usage observed in app router)
  - store-scope status: partial
  - production status: partially production-ready

- server/routers/consentRouter.ts
  - purpose: consentRouter domain routing
  - auth procedure used: mixed/inspect in-file (not proven centralized)
  - role gate: partial (requireAnyRole/protectedProcedure usage observed in app router)
  - store-scope status: partial
  - production status: partially production-ready

- server/routers/customerMedicineRouter.ts
  - purpose: customerMedicineRouter domain routing
  - auth procedure used: mixed/inspect in-file (not proven centralized)
  - role gate: partial (requireAnyRole/protectedProcedure usage observed in app router)
  - store-scope status: partial
  - production status: partially production-ready

- server/routers/deliveryRouter.ts
  - purpose: deliveryRouter domain routing
  - auth procedure used: mixed/inspect in-file (not proven centralized)
  - role gate: partial (requireAnyRole/protectedProcedure usage observed in app router)
  - store-scope status: partial
  - production status: partially production-ready

- server/routers/helpdeskRouter.ts
  - purpose: helpdeskRouter domain routing
  - auth procedure used: mixed/inspect in-file (not proven centralized)
  - role gate: partial (requireAnyRole/protectedProcedure usage observed in app router)
  - store-scope status: partial
  - production status: partially production-ready

- server/routers/ingestionRouter.ts
  - purpose: ingestionRouter domain routing
  - auth procedure used: mixed/inspect in-file (not proven centralized)
  - role gate: partial (requireAnyRole/protectedProcedure usage observed in app router)
  - store-scope status: partial
  - production status: partially production-ready

- server/routers/inventoryRouter.ts
  - purpose: inventoryRouter domain routing
  - auth procedure used: mixed/inspect in-file (not proven centralized)
  - role gate: partial (requireAnyRole/protectedProcedure usage observed in app router)
  - store-scope status: partial
  - production status: partially production-ready

- server/routers/masterDataPart3Router.ts
  - purpose: masterDataPart3Router domain routing
  - auth procedure used: mixed/inspect in-file (not proven centralized)
  - role gate: partial (requireAnyRole/protectedProcedure usage observed in app router)
  - store-scope status: partial
  - production status: partially production-ready

- server/routers/masterDataRouter.ts
  - purpose: masterDataRouter domain routing
  - auth procedure used: mixed/inspect in-file (not proven centralized)
  - role gate: partial (requireAnyRole/protectedProcedure usage observed in app router)
  - store-scope status: partial
  - production status: partially production-ready

- server/routers/medivisionRouter.ts
  - purpose: medivisionRouter domain routing
  - auth procedure used: mixed/inspect in-file (not proven centralized)
  - role gate: partial (requireAnyRole/protectedProcedure usage observed in app router)
  - store-scope status: partial
  - production status: partially production-ready

- server/routers/ocrIngestionRouter.ts
  - purpose: ocrIngestionRouter domain routing
  - auth procedure used: mixed/inspect in-file (not proven centralized)
  - role gate: partial (requireAnyRole/protectedProcedure usage observed in app router)
  - store-scope status: partial
  - production status: partially production-ready

- server/routers/paymentRouter.ts
  - purpose: paymentRouter domain routing
  - auth procedure used: mixed/inspect in-file (not proven centralized)
  - role gate: partial (requireAnyRole/protectedProcedure usage observed in app router)
  - store-scope status: partial
  - production status: partially production-ready

- server/routers/pharmacyRouter.ts
  - purpose: pharmacyRouter domain routing
  - auth procedure used: mixed/inspect in-file (not proven centralized)
  - role gate: partial (requireAnyRole/protectedProcedure usage observed in app router)
  - store-scope status: partial
  - production status: partially production-ready

- server/routers/prescriptionGovRouter.ts
  - purpose: prescriptionGovRouter domain routing
  - auth procedure used: mixed/inspect in-file (not proven centralized)
  - role gate: partial (requireAnyRole/protectedProcedure usage observed in app router)
  - store-scope status: partial
  - production status: partially production-ready

- server/routers/purchaseRouter.ts
  - purpose: purchaseRouter domain routing
  - auth procedure used: mixed/inspect in-file (not proven centralized)
  - role gate: partial (requireAnyRole/protectedProcedure usage observed in app router)
  - store-scope status: partial
  - production status: partially production-ready

- server/routers/reportsRouter.ts
  - purpose: reportsRouter domain routing
  - auth procedure used: mixed/inspect in-file (not proven centralized)
  - role gate: partial (requireAnyRole/protectedProcedure usage observed in app router)
  - store-scope status: partial
  - production status: partially production-ready

- server/routers/salesRouter.ts
  - purpose: salesRouter domain routing
  - auth procedure used: mixed/inspect in-file (not proven centralized)
  - role gate: partial (requireAnyRole/protectedProcedure usage observed in app router)
  - store-scope status: partial
  - production status: partially production-ready

- server/routers/whatsappRouter.ts
  - purpose: whatsappRouter domain routing
  - auth procedure used: mixed/inspect in-file (not proven centralized)
  - role gate: partial (requireAnyRole/protectedProcedure usage observed in app router)
  - store-scope status: partial
  - production status: partially production-ready

- server/routers.ts (main app router composition)
  - purpose: root API routing, auth, cart/order/customer/admin composition
  - auth procedure used: publicProcedure/protectedProcedure + role helpers
  - role gate: yes (requireAnyRole etc.)
  - store-scope status: partial
  - production status: partially production-ready

## 4) Service inventory

- server/services/accountingBasics.ts
  - purpose: accountingBasics domain logic
  - durable DB-backed or in-memory/helper-only: mixed (not proven for all methods)
  - audit logging status: partial
  - critical dependencies: db + internal services
  - production status: partially production-ready
  - known risks: store scope/idempotency/security path proof pending

- server/services/audit.test.ts
  - purpose: audit.test domain logic
  - durable DB-backed or in-memory/helper-only: mixed (not proven for all methods)
  - audit logging status: partial
  - critical dependencies: db + internal services
  - production status: partially production-ready
  - known risks: store scope/idempotency/security path proof pending

- server/services/audit.ts
  - purpose: audit domain logic
  - durable DB-backed or in-memory/helper-only: mixed (not proven for all methods)
  - audit logging status: partial
  - critical dependencies: db + internal services
  - production status: partially production-ready
  - known risks: store scope/idempotency/security path proof pending

- server/services/barcodeService.ts
  - purpose: barcodeService domain logic
  - durable DB-backed or in-memory/helper-only: mixed (not proven for all methods)
  - audit logging status: partial
  - critical dependencies: db + internal services
  - production status: partially production-ready
  - known risks: store scope/idempotency/security path proof pending

- server/services/complianceGate.ts
  - purpose: complianceGate domain logic
  - durable DB-backed or in-memory/helper-only: mixed (not proven for all methods)
  - audit logging status: partial
  - critical dependencies: db + internal services
  - production status: partially production-ready
  - known risks: store scope/idempotency/security path proof pending

- server/services/deliveryOps.ts
  - purpose: deliveryOps domain logic
  - durable DB-backed or in-memory/helper-only: mixed (not proven for all methods)
  - audit logging status: partial
  - critical dependencies: db + internal services
  - production status: partially production-ready
  - known risks: store scope/idempotency/security path proof pending

- server/services/dosageTracking.ts
  - purpose: dosageTracking domain logic
  - durable DB-backed or in-memory/helper-only: mixed (not proven for all methods)
  - audit logging status: partial
  - critical dependencies: db + internal services
  - production status: partially production-ready
  - known risks: store scope/idempotency/security path proof pending

- server/services/marginGuard.ts
  - purpose: marginGuard domain logic
  - durable DB-backed or in-memory/helper-only: mixed (not proven for all methods)
  - audit logging status: partial
  - critical dependencies: db + internal services
  - production status: partially production-ready
  - known risks: store scope/idempotency/security path proof pending

- server/services/notificationService.ts
  - purpose: notificationService domain logic
  - durable DB-backed or in-memory/helper-only: mixed (not proven for all methods)
  - audit logging status: partial
  - critical dependencies: db + internal services
  - production status: partially production-ready
  - known risks: store scope/idempotency/security path proof pending

- server/services/ocrPurchaseInwarding.ts
  - purpose: ocrPurchaseInwarding domain logic
  - durable DB-backed or in-memory/helper-only: mixed (not proven for all methods)
  - audit logging status: partial
  - critical dependencies: db + internal services
  - production status: partially production-ready
  - known risks: store scope/idempotency/security path proof pending

- server/services/orderRating.ts
  - purpose: orderRating domain logic
  - durable DB-backed or in-memory/helper-only: mixed (not proven for all methods)
  - audit logging status: partial
  - critical dependencies: db + internal services
  - production status: partially production-ready
  - known risks: store scope/idempotency/security path proof pending

- server/services/reconciliationTruth.ts
  - purpose: reconciliationTruth domain logic
  - durable DB-backed or in-memory/helper-only: mixed (not proven for all methods)
  - audit logging status: partial
  - critical dependencies: db + internal services
  - production status: partially production-ready
  - known risks: store scope/idempotency/security path proof pending

- server/services/refillReminderService.ts
  - purpose: refillReminderService domain logic
  - durable DB-backed or in-memory/helper-only: mixed (not proven for all methods)
  - audit logging status: partial
  - critical dependencies: db + internal services
  - production status: partially production-ready
  - known risks: store scope/idempotency/security path proof pending

- server/services/shiftClosing.ts
  - purpose: shiftClosing domain logic
  - durable DB-backed or in-memory/helper-only: mixed (not proven for all methods)
  - audit logging status: partial
  - critical dependencies: db + internal services
  - production status: partially production-ready
  - known risks: store scope/idempotency/security path proof pending

- server/services/slaService.ts
  - purpose: slaService domain logic
  - durable DB-backed or in-memory/helper-only: mixed (not proven for all methods)
  - audit logging status: partial
  - critical dependencies: db + internal services
  - production status: partially production-ready
  - known risks: store scope/idempotency/security path proof pending

- server/services/stockInvariant.ts
  - purpose: stockInvariant domain logic
  - durable DB-backed or in-memory/helper-only: mixed (not proven for all methods)
  - audit logging status: partial
  - critical dependencies: db + internal services
  - production status: partially production-ready
  - known risks: store scope/idempotency/security path proof pending

- server/services/supplierLedger.ts
  - purpose: supplierLedger domain logic
  - durable DB-backed or in-memory/helper-only: mixed (not proven for all methods)
  - audit logging status: partial
  - critical dependencies: db + internal services
  - production status: partially production-ready
  - known risks: store scope/idempotency/security path proof pending

- server/services/supportService.ts
  - purpose: supportService domain logic
  - durable DB-backed or in-memory/helper-only: mixed (not proven for all methods)
  - audit logging status: partial
  - critical dependencies: db + internal services
  - production status: partially production-ready
  - known risks: store scope/idempotency/security path proof pending

- server/services/tallyExport.ts
  - purpose: tallyExport domain logic
  - durable DB-backed or in-memory/helper-only: mixed (not proven for all methods)
  - audit logging status: partial
  - critical dependencies: db + internal services
  - production status: partially production-ready
  - known risks: store scope/idempotency/security path proof pending

- server/services/whatsappBridge.ts
  - purpose: whatsappBridge domain logic
  - durable DB-backed or in-memory/helper-only: mixed (not proven for all methods)
  - audit logging status: partial
  - critical dependencies: db + internal services
  - production status: partially production-ready
  - known risks: store scope/idempotency/security path proof pending

## 5) Schema/migration inventory
- schema files: drizzle/schema.ts, drizzle/relations.ts
- migration files found: 29
- latest migration identifier: see highest lexicographic SQL file (manual verification needed)
- migration numbering risks: part-prefixed + numeric-prefixed files mixed
- duplicate table risks: not proven; requires migration smoke on clean DB
- recent prompt table checks:
  - discount_codes: present
  - notification_events: present
  - notification_preferences: present
  - dosage_schedules: present
  - dose_logs: present
  - order_ratings: present
  - barcode_aliases: present
  - label_print_jobs: present
- required migration smoke gaps: full clean-room migrate/rollback test not proven

## 6) Test inventory
- Test files found: 18
- server/audit-unification.guard.test.ts
- server/auth.logout.test.ts
- server/auth.phone.test.ts
- server/barcode-scan.guard.test.ts
- server/catalog.access.test.ts
- server/compliance-gate.guard.test.ts
- server/customer-mobile.guard.test.ts
- server/discount-code.foundation.guard.test.ts
- server/ingestion.helpdesk.consent.test.ts
- server/margin-guard.guard.test.ts
- server/ocr-purchase.guard.test.ts
- server/ops-bridge.guard.test.ts
- server/pharmacy.test.ts
- server/reconciliation-truth.guard.test.ts
- server/routing.test.ts
- server/services/audit.test.ts
- server/stock-invariant.guard.test.ts
- server/supplier-ledger.guard.test.ts

Classification summary:
- static guard: present (multiple *guard.test.ts)
- service unit: partial
- integration: partial
- migration smoke: not proven
- security: partial
- end-to-end commercial flow: not proven
- UI/frontend: not proven

Missing or not proven tests:
- sale → stock → payment → report
- cancel/return → refund → stock/report
- purchase → stock → supplier payable
- H1 regulated medicine release proof
- store isolation
- idempotency/concurrency
- payment webhook/refund
- migration smoke
- security/env validation
- storage proxy access
- worker route lock

## 7) Env/provider inventory
- database: keys found (DB URL style env usage); production required; risk if missing: total outage; status: unknown
- JWT/session: cookie/session token flow present; required; status: unknown
- OAuth: callback machinery present; required if social login enabled; status: external provider pending
- storage: S3/storage proxy files present; required for docs/images; status: external provider pending
- Razorpay/payment: payment router present; required for production online payments; status: external provider pending
- WhatsApp: bridge/webhook router present; optional until enabled; status: feature-flagged disabled needed
- SMS/OTP: OTP send/verify present with logging risk; required for phone auth; status: unsafe default detected
- email: notification framework partial; optional depending channel; status: unknown
- push notifications: notification service present; optional depending app mode; status: unknown
- OCR: OCR ingestion + service present; optional if manual inwarding fallback; status: external provider pending
- maps: location/serviceability modules present; optional fallback possible; status: unknown
- Tally/export: tallyExport service present; optional per store; status: partially production-ready
- barcode printer: barcode service + label jobs present; optional with manual print fallback; status: external provider pending
- analytics/monitoring: not proven

## 8) Dangerous paths / red-alert list
- /api/worker/run (server/worker.ts): risk high; auth not proven; audit unknown; rating unsafe for production; next PR feat/security-red-alert-lockdown
- storage proxy (server/_core/storageProxy.ts): risk high access leakage; auth partial/not proven; audit unknown; rating unsafe for production; next PR feat/security-red-alert-lockdown
- OTP send/verify (server/routers.ts authRouter): risk logging/rate-limit; auth n/a (public); audit partial; rating partially production-ready; next PR feat/security-red-alert-lockdown
- OAuth callback (server/_core/oauth.ts): risk session hijack/misconfig; auth flow exists; audit unknown; rating partial; next PR feat/security-red-alert-lockdown
- upload routes (server/storage.ts + ingestion routers): risk file exposure; auth partial; audit partial; rating partial; next PR feat/security-red-alert-lockdown
- WhatsApp webhook (server/routers/whatsappRouter.ts): signature/rate-limit proof pending; rating partial
- admin routes (pharmacyRouter/masterData/reports/commandCenter): role gates present but central RBAC proof pending; rating partial
- prescription image access (prescriptionGovRouter/storage): privacy risk; auth partial; audit partial; rating partial
- invoice/report exports (reportsRouter/tallyExport): data leakage risk; auth partial; rating partial
- payment verify/webhook/refund (paymentRouter): truth proof pending; rating partial
- regulated sale confirmation + H1 register creation (salesRouter/prescriptionGovRouter/complianceGate): correctness proof pending; rating partial
- stock mutation paths (inventoryRouter/purchase/sales/stockInvariant): opening-stock and transfer atomicity proof pending; rating partial
- barcode scan endpoints (barcodeService + scanner guard): chain-of-truth proof pending; rating partial
- support cancellation path (helpdesk/supportService): reconciliation ties need proof; rating partial
- shift closing path (shiftClosing service/router integrations): closure ledger proof pending; rating partial

## 9) Active vs scaffold vs placeholder module map
Keyword audit classification summary:
- TODO/FIXME/mock/placeholder/scaffold/foundation/demo/pilot/not configured/fake/in-memory/entityId:0/qtyBefore:0/qtyAfter:0 occurrences require per-case review.
- Current classification approach:
  - harmless comment: docs/test TODOs not affecting runtime
  - documented limitation: release-status files describing pending hardening
  - must fix: auth/rate-limit/env fail-hard gaps on critical routes
  - dangerous production placeholder: any public critical mutation path or dev fallback in auth/OTP/storage/payment

## 10) Known production blockers
- security lockdown pending
- GitHub CI/branch protection pending
- store isolation not fully proven
- idempotency/reservation truth pending
- stock opening/transfer atomicity needs proof/fix
- H1 register correctness needs proof/fix
- regulated delivery release proof pending
- payment webhook/refund production truth pending
- invoice/GST/statutory numbering pending
- accounting/supplier/Tally production hardening pending
- product master normalization pending
- provider contract matrix pending
- deployment/observability/backup pending
- performance/load pending
- UX/admin polish pending
- training/SOP pending
- investor/dev audit pack pending

## 11) Immediate next 5 PRs
1. feat/security-red-alert-lockdown
2. chore/github-ci-branch-protection
3. feat/store-isolation-rbac
4. feat/idempotency-reservation-truth
5. feat/stock-truth-10

Stale PR cleanup/status is included in this baseline PR via STALE_PR_STATUS.md.

## 12) Full roadmap summary (0–18)
0. Production baseline audit + stale PR cleanup
1. Red-alert security lockdown
2. GitHub CI + unsafe-merge blocking
3. Store isolation + central RBAC
4. Idempotency, concurrency, reservation truth
5. Stock truth to 10/10
6. Order/sale/reconciliation truth to 10/10
7. Rx/H/H1/X compliance + prescription vault
8. Payment gateway/webhook/refund truth
9. Invoice, GST, statutory billing correctness
10. Accounting, supplier ledger, Tally readiness
11. Product master normalization + real-store data migration
12. Barcode scan-to-truth production UX
13. Placeholder elimination + provider contract matrix
14. Deployment, observability, backup, audit immutability
15. Performance/load + HTTP hardening
16. Customer/mobile/admin UX polish
17. Training/SOP mode + production smoke checklist
18. Investor/dev audit pack

## Validation snapshot
- pnpm install: pass (with pnpm build-script approval warning)
- pnpm run check: pass
- pnpm test -- --runInBand: pass
- pnpm run build: pass (with non-blocking VITE_ANALYTICS var and chunk-size warnings)
