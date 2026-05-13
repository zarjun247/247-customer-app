# SLO Coverage

Source-of-truth for `scripts/slo-coverage-verify.mjs`. Lists every critical path and whether it has an SLO event wired.

Updated after each merged MP. See [RUNTIME.md](./RUNTIME.md) §SLO definitions and budgets for targets.

---

## Critical paths × SLO presence

| Critical path | SLO name | Target | Emitter wired | Notes |
|--------------|----------|--------|---------------|-------|
| sale.confirmSale | `sale.confirmSale.latency` | p95 ≤ 300ms | Yes — server/routers/salesRouter.ts:740 | SM-N verified |
| purchase.commitPurchaseInvoice | `purchase.commitPurchaseInvoice.latency` | p95 ≤ 500ms | Yes — server/routers/purchaseRouter.ts:693 | SM-N verified |
| payment.captureWebhook | `payment.captureWebhook.latency` | p99 ≤ 30s | Yes — server/paymentWebhookRoutes.ts:53 | SM-N verified |
| prescription.upload | `prescription.upload.latency` | p95 ≤ 2s | Yes — server/routers.ts:962 | SM-N verified |
| ocr.process | `ocr.process.latency` | p95 ≤ 5s | Yes — server/ingestion.ts:435 | SM-N verified |
| inventory.adjust | `inventory.adjust.latency` | p95 ≤ 200ms | Yes — server/routers/inventoryRouter.ts:954 | SM-N verified |
| dsr.access | `dsr.access.latency` | p95 ≤ 500ms | Yes — server/routers/dsrRouter.ts:18 | SM-N verified |
| dsr.erasure | `dsr.erasure.latency` | p95 ≤ 5s | Yes — server/routers/dsrRouter.ts:85 | SM-N verified |
| retention.tick | `retention.tick.duration` | p95 ≤ 30s per tick | Yes — server/services/retentionWorker.ts:81 | SM-N verified |

---

## Provider SLO coverage

| Provider | SLO name | Target | Emitter wired | Notes |
|----------|----------|--------|---------------|-------|
| razorpay | `provider.razorpay.success.rate` | ≥ 99% | Yes — providerHealthService.ts emitProviderHealthSloEvent() | MP1-rest PR-B |
| whatsapp | `provider.whatsapp.success.rate` | ≥ 99% | Yes — same service | MP1-rest PR-B |
| ocr | `provider.ocr.success.rate` | ≥ 95% | Yes — same service | MP1-rest PR-B |
| storage | `provider.storage.success.rate` | ≥ 99.9% | Yes — same service | MP1-rest PR-B |

---

## SLO wiring status

**Current state (2026-05-13, post SM-N):** All 9 critical path latency SLOs and all 4 provider SLOs are wired. The "Not yet wired" status in earlier snapshots was stale — all paths were wired incrementally across SM-B through SM-LM and verified in SM-N.

**Target (pre-production):** All rows in the "Emitter wired" column must show "Yes" before production launch.

---

## How to add a new critical path

1. Add a row to the table above with the SLO name, target, and "Not yet wired" in the emitter column.
2. Wire `emitSloEvent()` in the relevant router or service.
3. Update the emitter column to "Yes" in this doc.
4. Verify with: `pnpm run slo:coverage` — must exit 0.

---

## SLO budget policy

SLO budgets reset monthly. A budget breach fires a `withinBudget=false` SLO event, which:
- Is visible in Admin Command Center → SLA Board
- Counts in `/metrics` → `slo_budget_breach_total`
- Triggers an on-call alert if the breach persists for > 10 minutes (P1)

Budget burn rate is not currently tracked (post-launch enhancement). For now, alert threshold = any breach.
