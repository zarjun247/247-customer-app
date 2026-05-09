# PRODUCTION_READINESS_STATUS

## 1. Current score
- Overall: 7.4 / 10
- Last updated by: feat/mega-02-stock-reservation-truth
- Next target after immediate 5 PRs: 8.0+

## 2. Phase checklist
### Phase 0
- status: partial
- current score /10: 7.2
- owner branch/PR: chore/production-baseline-audit
- blockers: security/CI/store-scope/idempotency/payment/migration proof pending
- acceptance criteria: phase-specific production hardening complete and validated
- next action: execute roadmap phase PR

### Phase 1
- status: not started
- current score /10: 0.0
- owner branch/PR: TBD
- blockers: security/CI/store-scope/idempotency/payment/migration proof pending
- acceptance criteria: phase-specific production hardening complete and validated
- next action: execute roadmap phase PR

### Phase 2
- status: not started
- current score /10: 0.0
- owner branch/PR: TBD
- blockers: security/CI/store-scope/idempotency/payment/migration proof pending
- acceptance criteria: phase-specific production hardening complete and validated
- next action: execute roadmap phase PR

### Phase 3
- status: not started
- current score /10: 0.0
- owner branch/PR: TBD
- blockers: security/CI/store-scope/idempotency/payment/migration proof pending
- acceptance criteria: phase-specific production hardening complete and validated
- next action: execute roadmap phase PR

### Phase 4
- status: not started
- current score /10: 0.0
- owner branch/PR: TBD
- blockers: security/CI/store-scope/idempotency/payment/migration proof pending
- acceptance criteria: phase-specific production hardening complete and validated
- next action: execute roadmap phase PR

### Phase 5
- status: not started
- current score /10: 0.0
- owner branch/PR: TBD
- blockers: security/CI/store-scope/idempotency/payment/migration proof pending
- acceptance criteria: phase-specific production hardening complete and validated
- next action: execute roadmap phase PR

### Phase 6
- status: not started
- current score /10: 0.0
- owner branch/PR: TBD
- blockers: security/CI/store-scope/idempotency/payment/migration proof pending
- acceptance criteria: phase-specific production hardening complete and validated
- next action: execute roadmap phase PR

### Phase 7
- status: not started
- current score /10: 0.0
- owner branch/PR: TBD
- blockers: security/CI/store-scope/idempotency/payment/migration proof pending
- acceptance criteria: phase-specific production hardening complete and validated
- next action: execute roadmap phase PR

### Phase 8
- status: not started
- current score /10: 0.0
- owner branch/PR: TBD
- blockers: security/CI/store-scope/idempotency/payment/migration proof pending
- acceptance criteria: phase-specific production hardening complete and validated
- next action: execute roadmap phase PR

### Phase 9
- status: not started
- current score /10: 0.0
- owner branch/PR: TBD
- blockers: security/CI/store-scope/idempotency/payment/migration proof pending
- acceptance criteria: phase-specific production hardening complete and validated
- next action: execute roadmap phase PR

### Phase 10
- status: partial
- current score /10: 7.2
- owner branch/PR: feat/accounting-supplier-tally-production
- blockers: durable allocation table + durable journal table + tally export run audit table pending
- acceptance criteria: supplier allocation truth + accounting journal durability + tally duplicate prevention
- next action: feat/product-master-normalization-migration

### Phase 11
- status: partial
- current score /10: 7.6
- owner branch/PR: feat/product-master-normalization-migration
- blockers: full runtime router wiring + durable import batch tables + production barcode UX pending
- acceptance criteria: canonical product identity + completeness + migration safety + guarded substitution
- next action: feat/barcode-production-ux

### Phase 12
- status: not started
- current score /10: 0.0
- owner branch/PR: TBD
- blockers: security/CI/store-scope/idempotency/payment/migration proof pending
- acceptance criteria: phase-specific production hardening complete and validated
- next action: execute roadmap phase PR

### Phase 13
- status: not started
- current score /10: 0.0
- owner branch/PR: TBD
- blockers: security/CI/store-scope/idempotency/payment/migration proof pending
- acceptance criteria: phase-specific production hardening complete and validated
- next action: execute roadmap phase PR

### Phase 14
- status: not started
- current score /10: 0.0
- owner branch/PR: TBD
- blockers: security/CI/store-scope/idempotency/payment/migration proof pending
- acceptance criteria: phase-specific production hardening complete and validated
- next action: execute roadmap phase PR

### Phase 15
- status: not started
- current score /10: 0.0
- owner branch/PR: TBD
- blockers: security/CI/store-scope/idempotency/payment/migration proof pending
- acceptance criteria: phase-specific production hardening complete and validated
- next action: execute roadmap phase PR

### Phase 16
- status: not started
- current score /10: 0.0
- owner branch/PR: TBD
- blockers: security/CI/store-scope/idempotency/payment/migration proof pending
- acceptance criteria: phase-specific production hardening complete and validated
- next action: execute roadmap phase PR

### Phase 17
- status: not started
- current score /10: 0.0
- owner branch/PR: TBD
- blockers: security/CI/store-scope/idempotency/payment/migration proof pending
- acceptance criteria: phase-specific production hardening complete and validated
- next action: execute roadmap phase PR

### Phase 18
- status: not started
- current score /10: 0.0
- owner branch/PR: TBD
- blockers: security/CI/store-scope/idempotency/payment/migration proof pending
- acceptance criteria: phase-specific production hardening complete and validated
- next action: execute roadmap phase PR

## 3. Immediate red-alert blockers
- worker route lock
- storage proxy access control
- production env fail-hard
- OTP production logging/rate limits (partially hardened; database-backed limiter/provider validation still required for production)
- GitHub CI missing or unproven
- H1 register correctness
- stock opening/transfer/reservation truth
- store isolation
- payment webhook/refund truth

## 4. Production doctrine
- No more feature jazz.
- No more shiny dragons.
- No pilot language.
- No fake-complete modules.
- No hidden stubs.
- No in-memory-only production features.
- No unscoped access.
- No unaudited critical mutation.
- No regulated medicine release without compliance truth.
- No stock mutation outside invariant truth.
- No payment/refund without ledger truth.

## 5. Definition of 10/10
The system is 10/10 only when it is:
- secure
- store-scoped
- idempotent
- audited
- compliance-proof
- payment-proof
- stock-proof
- report-proof
- migration-proof
- deployable
- recoverable
- trainable
- investor-auditable

## Validation status
- pnpm install: pass (warning: ignored build scripts approval prompt)
- pnpm run check: pass
- pnpm test -- --runInBand: pass
- pnpm run build: pass (non-blocking warnings on analytics env/chunk size)

- 2026-05-03: Red-alert security lockdown updates applied (env fail-hard, worker auth, storage proxy hardening, OTP hardening, security guard tests). Next: chore/github-ci-branch-protection.


## 2026-05-03 CI and unsafe-merge blocking update
- Phase 2 (GitHub CI + unsafe-merge blocking): **in progress** (workflows and guards added in PR branch, pending branch-protection settings in GitHub).
- CI score: **7.0 / 10** (up from 6.8 after CI workflow + migration/placeholder/security guard automation).
- Remaining CI gaps: branch protection enforcement, ephemeral DB-backed migration smoke, strict required check wiring in repository settings.
- Next PR: `feat/store-isolation-rbac`.


## Phase 3 Store isolation + central RBAC
Status: partial
Store isolation score: 7/10
Remaining blockers: full router rollout + integration coverage + customer dependent authorization.
Next PR: feat/idempotency-reservation-truth
production chain operations require store-scoped staff/admin access.

- 2026-05-03: corrected unsafe default-store fallback in delivery router; staff store assignment now fail-closed for scoped delivery/report flows.

## Prompt 5 Update (Idempotency/Reservation)
- Phase 4 status: partial (durable idempotency table + service + canonical availability helper landed).
- Remaining blockers: full transactional locking/replay posture across all mutation endpoints.
- Next PR: feat/stock-truth-10.

## Prompt 5 correction note (2026-05-03)
- Phase 4 remains partial.
- Wired duplicate/idempotency guards into purchase commit, sale confirm, payment verify, delivery delivered, stock audit complete, and OCR draft commit.
- Reservation truth now enforced in sale confirm via canonical availability helper.
- Next PR: feat/stock-truth-10.

## Phase 5 — Stock Truth 10/10 (Prompt 6)
- Status: partial (in progress)
- Score: 8.8/10
- Blockers: full commercial-flow integration test matrix and remaining legacy availability reads.
- Next PR: `test/commercial-flow-integration`

- Phase 6 commercial flow integration tests added (service/static coverage); see COMMERCIAL_FLOW_TEST_STATUS.md.
- Next PR: feat/regulated-release-prescription-vault.

- Regulated release status tracked in `REGULATED_RELEASE_STATUS.md`; prescription vault status tracked in `PRESCRIPTION_VAULT_STATUS.md`.

- Phase 7 update: delivery/whatsapp/refill regulated runtime gates and vault view audit enforced (partial completion). Next PR: feat/payment-gateway-refund-reconciliation

- Phase 8 Payment gateway, webhook, refund truth: partial (service hardening + env guard + verify idempotency audit landed; webhook endpoint/report normalization still pending). Next PR: feat/invoice-statutory-billing.

- Phase 8 correction: webhook posture fail-closed when route unsupported, refund provider state now pending/manual (no premature success), over-refund guard added. Next PR: feat/invoice-statutory-billing.

- Statutory invoice/GST billing status is tracked in `INVOICE_STATUTORY_STATUS.md`; production release requires unique invoice numbering and GST correctness.


## 2026-05-04 Accounting/Tally production note
- Accounting/Tally production status tracked in `ACCOUNTING_TALLY_PRODUCTION_STATUS.md`.
- Production readiness requires supplier allocation truth and export audit truth before claiming complete.
- Next PR: `feat/product-master-normalization-migration`.


## 2026-05-04 Phase 11 update
- Product master normalization tracked in `PRODUCT_MASTER_NORMALIZATION_STATUS.md`.
- Salsette migration/import sequence tracked in `REAL_STORE_DATA_MIGRATION_PLAN.md`.
- Next PR: `feat/barcode-production-ux`.

## 2026-05-04 P0 backend truth/security stabilization pass
- Branch: `feat/p0-backend-truth-security-pass`
- Focused P0/P1 backend fixes landed without feature expansion.
- Completed:
  - Purchase commit no longer directly increments stock quantity fields prior to canonical stock movement.
  - H1 register path removed unsafe `Number(line.id)` dependency and now persists string-safe sale/line references in canonical/audit context.
  - Storage proxy bearer spoof removed; authenticated user session required for sensitive access policy.
  - `deliverWithPhoto` now enforces regulated-release gate.
  - Payment signature verification hardened against malformed signature length mismatch and missing-secret fail-open behavior.
- Remaining before 9.8+/10:
  - dedicated H1 schema refs migration,
  - broader DB-backed stock/purchase return race tests,
  - full storage scope integration matrix,
  - wider provider stub fail-closed cleanup.


- 2026-05-05: Auth/cart/checkout/onboarding/upload/dosage safety patch landed on feat/mega-01-auth-checkout-customer-safety; rerun full validation before production claim.

## 5. 2026-05-07 customer safety update
- Improved customer auth/session safety, server-side cart/SKU validation, checkout lock cleanup, onboarding store assignment authority, prescription upload validation, and dosage ownership regressions.
- Remaining production risks: DB-backed integration tests for checkout failure compensation, durable OTP rate limiting/provider delivery in production, full file malware scanning, and broader store/role authorization matrix tests.


## Mega 02 stock reservation truth update (2026-05-07)

### Fixed items
- Canonical stock aggregation now derives product-store SKU stock from active batch ledger rows instead of per-movement overwrite behavior.
- Purchase returns preserve multi-batch truth and block over-return against canonical batch availability.
- Durable `stock_reservations` lifecycle now persists active/released/expired/consumed/cancelled rows and subtracts active reservations from availability.
- Checkout keeps PR #49 soft-lock safety but reconciles temporary SKU locks into durable reservations after order creation, with failure cleanup.
- App catalog/cart validation, POS batch availability, barcode lookup, and current-stock reporting now use canonical availability inputs.

### Remaining risks
- P0: none newly introduced in this pass.
- P1: real MySQL concurrent reservation integration/load test remains required before claiming oversell-proof durability under high contention.
- P1: payment/Rx/cancel release helper callers need a full order-state-machine audit to ensure every production edge calls the persisted release path.
- P2: command-center and older admin dashboard read models still display aggregate `storeSkus.stockQty`; they should eventually show canonical availability breakdowns.

### Deferred items and reason
- H1/payment/accounting/UI/barcode UX redesign intentionally deferred because it was outside Mega 02 scope.
- Full stock schema normalization intentionally deferred; this pass changed only reservation durability and aggregate sync/read paths needed for canonical availability.

### New score estimate
- Overall readiness: 7.4 / 10.
- Stock/reservation truth readiness: 8.1 / 10.

## 2026-05-07 Mega 03 idempotency + invoice race-safety update

### Fixed items
- Atomic idempotency begin path now inserts first and handles duplicate-key races deterministically.
- Stable mutation fingerprints now use canonical JSON plus SHA-256.
- Existing completed idempotency operations replay only for matching request hashes; different payloads conflict; in-progress duplicates fail fast; failed operations may retry only with the same hash.
- Invoice reservation now uses transaction row locks or a named-lock fallback, and draft numbers include UUID entropy.
- Financial-year calculations for invoices/returns/credit notes now use Asia/Kolkata business dates.
- Schema metadata now reflects unique constraints for idempotency keys, invoice sequences, sales bill numbers, and sale return numbers.

### Remaining P0/P1/P2 risks
- P0: production is not yet safe to claim complete until DB-backed concurrency tests run against a production-like MySQL instance for idempotency and invoice sequence races.
- P1: idempotency wrapping is not universal across every mutation endpoint.
- P1: dedicated audit `entity_ref` column/index migration is still pending.
- P2: credit-note statutory lifecycle and invoice PDF persistence remain incomplete.

### Deferred with reason
- H1/Rx/payment/refund/accounting/barcode UX and broader workflow redesigns were intentionally not changed in this PR.
- New migrations were not added because existing migrations `0026` and `0027` already contain the required constraints; only schema metadata needed alignment.

### New score estimate
- Overall production readiness: 8.2 / 10.
- Safe-to-merge assessment: safe as a focused hardening PR after validation, but not sufficient alone for full production readiness claims.

## 2026-05-09 latest-main validation doctrine update

Production-ready means all of the following are proven, not merely asserted:

- No runtime stubs are treated as production behavior.
- No placeholders are treated as production behavior.
- No fake provider/payment success is possible in production paths.
- No duplicate migrations exist on authenticated latest `main`.
- GitHub CI is green for the protected branch and release candidate.
- Branch protection is enforced with required checks.
- DB-backed concurrency proof is green against a production-like MySQL database.
- Provider runtime proof is green for payment, webhook, notification, accounting/export, and other configured providers.
- Healthcheck/observability is live and verified.
- Backup/restore proof is complete in controlled infrastructure, not only dry-run documentation.
- Salsette real-store reconciliation is complete.
- Regulated/H1/Rx release is proven across all production channels.

Current validation caveat: the 2026-05-09 latest-main validation pass did not run DB-backed race proof because `TEST_DATABASE_URL` was unavailable and no DB concurrency script is present in `package.json`. Production race-mode proof is therefore not claimed.
