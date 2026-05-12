# SLO Coverage

Source-of-truth for `scripts/slo-coverage-verify.mjs`. Lists every critical path and whether it has an SLO event wired.

Updated after each merged MP. See [RUNTIME.md](./RUNTIME.md) §SLO definitions and budgets for targets.

---

## Critical paths × SLO presence

| Critical path | SLO name | Target | Emitter wired | Notes |
|--------------|----------|--------|---------------|-------|
| sale.confirmSale | `sale.confirmSale.latency` | p95 ≤ 300ms | Planned (MP5 follow-up) | `executeCommand` wrapper not yet emitting SLO events |
| purchase.commitPurchaseInvoice | `purchase.commitPurchaseInvoice.latency` | p95 ≤ 500ms | Planned (MP5 follow-up) | Same as above |
| payment.captureWebhook | `payment.captureWebhook.latency` | p99 ≤ 30s | Planned (MP1-rest PR-B) | Dead-letter router follow-up noted in OPEN_BLOCKERS |
| prescription.upload | `prescription.upload.latency` | p95 ≤ 2s | Not yet wired | Prescription router needs emitSloEvent() call |
| ocr.process | `ocr.process.latency` | p95 ≤ 5s | Not yet wired | OCR worker needs emitSloEvent() on job completion |
| inventory.adjust | `inventory.adjust.latency` | p95 ≤ 200ms | Not yet wired | Stock movement write path needs emitSloEvent() |
| dsr.access | `dsr.access.latency` | p95 ≤ 500ms | Not yet wired | DSR router (SM-B) needs emitSloEvent() on access requests |
| dsr.erasure | `dsr.erasure.latency` | p95 ≤ 5s | Not yet wired | Retention worker (SM-B) needs emitSloEvent() on erasure completion |
| retention.tick | `retention.tick.duration` | p95 ≤ 30s per tick | Not yet wired | retentionWorker.ts runRetentionTick() needs emitSloEvent() |

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

**Current state (2026-05-12, post SM-C):** Provider SLOs are wired. Critical path latency SLOs are planned but not yet emitting. Wire `sloService.emitSloEvent()` calls incrementally in follow-up PRs (one router per PR with idempotency and test coverage).

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
